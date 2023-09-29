const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // TODO: Vulnerability? MITM attack?
  }
});
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL || 'postgres://postgres:@localhost:5432/todos',
//   ssl: process.env.DATABASE_URL ? true : false
// }) 

pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`, (err) => {
  if (err) {
    console.error('Error creating "pg_trgm" extension:', err);
  }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    hashed_password BYTEA,
    salt BYTEA,
    name TEXT,
    handle BYTEA UNIQUE
  )
`, (err) => {
  if (err) {
    console.error('Error creating "users" table:', err);
  }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS public_key_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id TEXT UNIQUE,
    public_key TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creating "public_key_credentials" table:', err);
  }
});

// TODO: Delete all todos functionality
pool.query(`
  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER
  )
`, (err) => {
  if (err) {
    console.error('Error creating "todos" table:', err);
  }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    balance DECIMAL(15,2) DEFAULT 500.00
  )
`, (err) => {
  if (err) {
    console.error('Error creating "profiles" table:', err);
  }
});


pool.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL,
    date_created BIGINT NOT NULL,
    date_completed BIGINT,
    audience TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Error creating "transactions" table:', err);
  }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS friends (
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Error creating "friends" table:', err);
  }
});

// TODO: Implement comments
// pool.query(`
//   CREATE TABLE IF NOT EXISTS comments (
// 
//   )
//   `);

// Functions for querying the database
async function getUserByID(id) { // TODO: verify that this works
  try {
    const res = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null
  }
};

async function updateProfile(id, firstName = null, lastName = null) {
  try {
    await pool.query(`UPDATE profiles SET first_name = $1, last_name = $2 WHERE user_id = $3`, [firstName, lastName, id]);
  } catch (error) {
    console.error(error);
  }
}

async function getProfileByID(id) {
  try {
    const res = await pool.query(`SELECT * FROM profiles WHERE user_id = $1`, [id]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null
  }
};

async function getFriendsByID(id) {
  try {
    const res = await pool.query(`SELECT * FROM friends WHERE (user1_id = $1 OR user2_id = $1) AND relationship = 'friend'`, [id]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getRelationshipRow(id1, id2) {
  if (id1 > id2) {
    return getRelationshipRow(id2, id1);
  }

  try {
    const res = await pool.query(`SELECT * FROM friends WHERE user1_id = $1 AND user2_id = $2`, [id1, id2]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function upsertRelationshipRow(requesterId, requestedId, relationship) {
  let user1_id = requesterId, user2_id = requestedId;
  let swapped = false;
  if (requesterId > requestedId) {
    user1_id = requestedId;
    user2_id = requesterId;
    swapped = true;
  }

  let dbRelationship;
  if (relationship === "request") {
    if (!swapped) {
      dbRelationship = "user1Requested";
    } else {
      dbRelationship = "user2Requested";
    }
  } else {
    dbRelationship = "friend";
  }

  try {
    await pool.query(`INSERT INTO friends (user1_id, user2_id, relationship) VALUES ($1, $2, $3) 
    ON CONFLICT (user1_id, user2_id) DO UPDATE 
      SET relationship = $3`, [user1_id, user2_id, dbRelationship]);
  } catch (error) {
    console.error(error);
  }
};

async function deleteRelationshipRow(id1, id2) {
  if (id1 > id2) {
    deleteRelationshipRow(id2, id1);
    return
  }

  try {
    await pool.query(`DELETE FROM friends WHERE user1_id = $1 AND user2_id = $2`, [id1, id2]);
  } catch (error) {
    console.error(error);
  }
};

// TODO: have friend results show first in the search, followed by other users
async function searchProfiles(query, limit) {
  try {
    const res = await pool.query(`
      SELECT
          username,
          similarity(username, $1) AS exact_similarity
      FROM
          profiles
      WHERE
          username % $1
      ORDER BY
          CASE
              WHEN username = $1 THEN 1
              WHEN username ILIKE $1 || '%' THEN 2
              ELSE 3
          END,
          similarity(username, $1) DESC
      LIMIT $2
    `, [query, limit]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function insertTransaction(actor_id, target_id, amount, action, status, note, audience = "public") {
  let date_created = Date.now() / 1000;
  let date_completed = null;
  if (action === "pay") {
    date_completed = Date.now() / 1000;
  }

  try {
    const res = await pool.query(`INSERT INTO transactions 
    (actor_id, target_id, amount, action, status, note, date_created, date_completed, audience) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, date_created, date_completed`,
    [actor_id, target_id, amount, action, status, note, date_created, date_completed, audience]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function updateBalance(id, newBalance) {
  try {
    const res = await pool.query(`UPDATE profiles SET balance = $1 WHERE user_id = $2`, [newBalance, id]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getTransactionsForFriendsFeed(friendIDs, myID, before = null, after = null, limit, lastTransactionID = null) {
  try {
    const res = await pool.query(`
    SELECT *
    FROM transactions
    WHERE (((actor_id = ANY ($1::integer[]) OR target_id = ANY ($1::integer[])) AND (audience = 'friends' OR audience = 'public' OR actor_id = $2 OR target_id = $2))
      OR (actor_id = $2 OR target_id = $2))
      AND status = 'settled'
      AND ($6::integer IS NULL OR id < $6)
      AND ($3::integer IS NULL OR date_completed < $3)
      AND ($4::integer IS NULL OR date_completed > $4)
    ORDER BY id DESC NULLS LAST
    LIMIT $5
    `, [friendIDs, myID, before, after, limit, lastTransactionID]); // OR actor_id = $2 OR target_id = $2
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getMyRecentTransactions(myID, before = null, after = null, limit, lastTransactionID = null) {
  try {
    const res = await pool.query(`
    SELECT *
    FROM transactions
    WHERE (actor_id = $1 OR target_id = $1)
      AND status = 'settled'
      AND ($5::integer IS NULL OR id < $5)
      AND ($2::integer IS NULL OR date_completed < $2)
      AND ($3::integer IS NULL OR date_completed > $3)
    ORDER BY id DESC NULLS LAST
    LIMIT $4
    `, [myID, before, after, limit, lastTransactionID]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getTransactionFeedOfFriend(myID, friendID, before = null, after = null, limit, lastTransactionID = null) {
  try {
    const res = await pool.query(`
    SELECT *
    FROM transactions
    WHERE (audience = 'friends' OR audience = 'public' OR (actor_id = $1 AND target_id = $2) OR (actor_id = $2 AND target_id = $1))
      AND status = 'settled'
      AND ($6::integer IS NULL OR id < $6)
      AND ($3::integer IS NULL OR date_completed < $3)
      AND ($4::integer IS NULL OR date_completed > $4)
    ORDER BY id DESC NULLS LAST
    LIMIT $5
    `, [myID, friendID, before, after, limit, lastTransactionID]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getTransactionFeedOfUser(myID, partyID, before = null, after = null, limit, lastTransactionID = null) {
  try {
    const res = await pool.query(`
    SELECT *
    FROM transactions
    WHERE (audience = 'public' OR (actor_id = $1 AND target_id = $2) OR (actor_id = $2 AND target_id = $1))
      AND status = 'settled'
      AND ($6::integer IS NULL OR id < $6)
      AND ($3::integer IS NULL OR date_completed < $3)
      AND ($4::integer IS NULL OR date_completed > $4)
    ORDER BY id DESC NULLS LAST
    LIMIT $5
    `, [myID, partyID, before, after, limit, lastTransactionID]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getTransactionsBetweenUsers(myID, partyID, before = null, after = null, limit, lastTransactionID = null) {
  try {
    const res = await pool.query(`
    SELECT *
    FROM transactions
    WHERE (actor_id = $1 AND target_id = $2) OR (actor_id = $2 AND target_id = $1)
      AND status = 'settled'
      AND ($6::integer IS NULL OR id < $6)
      AND ($3::integer IS NULL OR date_completed < $3)
      AND ($4::integer IS NULL OR date_completed > $4)
    ORDER BY id DESC NULLS LAST
    LIMIT $5
    `, [myID, partyID, before, after, limit, lastTransactionID]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getOutstandingTransactions(myID, before = null, after = null, limit, lastTransactionID = null) {
  try {
    const res = await pool.query(`
    SELECT *
    FROM transactions
    WHERE (actor_id = $1 OR target_id = $1)
      AND status = 'pending'
      AND ($5::integer IS NULL OR id < $5)
      AND ($2::integer IS NULL OR date_completed < $2)
      AND ($3::integer IS NULL OR date_completed > $3)
    ORDER BY id DESC NULLS LAST
    LIMIT $4
    `, [myID, before, after, limit, lastTransactionID]);
    return res.rows;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function getTransactionByID(id) {
  try {
    const res = await pool.query(`SELECT * FROM transactions WHERE id = $1`, [id]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function completeTransaction(id, status) {
  const dateCompleted = Date.now() / 1000;

  try {
    const res = await pool.query(`UPDATE transactions SET status = $1, date_completed = $2 WHERE id = $3`,
    [status, dateCompleted, id]);
    return res.rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

module.exports = {
  pool: pool,
  getUserByID: getUserByID,
  updateProfile: updateProfile,
  getProfileByID: getProfileByID,
  getFriendsByID: getFriendsByID,
  getRelationshipRow: getRelationshipRow,
  upsertRelationshipRow: upsertRelationshipRow,
  deleteRelationshipRow: deleteRelationshipRow,
  searchProfiles: searchProfiles,
  insertTransaction: insertTransaction,
  updateBalance: updateBalance,
  getTransactionsForFriendsFeed: getTransactionsForFriendsFeed,
  getMyRecentTransactions: getMyRecentTransactions,
  getTransactionFeedOfFriend: getTransactionFeedOfFriend,
  getTransactionFeedOfUser: getTransactionFeedOfUser,
  getTransactionsBetweenUsers: getTransactionsBetweenUsers,
  getOutstandingTransactions: getOutstandingTransactions,
  getTransactionByID: getTransactionByID,
  completeTransaction: completeTransaction,
};
