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
    user_id PRIMARY KEY INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    balance REAL DEFAULT 500.00
  )
`);

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
`);

pool.query(`
  CREATE TABLE IF NOT EXISTS friends (
    user1_id INTEGER NOT NULL,
    user2_id INTEGER NOT NULL,
    relationship TEXT NOT NULL
  )
`);

// TODO: Implement comments
// pool.query(`
//   CREATE TABLE IF NOT EXISTS comments (
// 
//   )
//   `);

// Functions for querying the database
function getUserByID(id) { // TODO: verify that this works
  pool.query(`SELECT * FROM users WHERE id = $1`, [id], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows[0];
  });
};

function getProfileByID(id) {
  pool.query(`SELECT * FROM profiles WHERE id = $1`, [id], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows[0];
  });
};

function getFriendsByID(id) {
  pool.query(`SELECT * FROM friends WHERE (user1_id = $1 OR user2_id = $1) AND relationship = 'friend'`, [id], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getRelationshipRow(id1, id2) {
  if (id1 > id2) {
    return getRelationshipRow(id2, id1);
  }
  pool.query(`SELECT * FROM friends WHERE user1_id = $1 AND user2_id = $2`, [id1, id2], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows[0];
  });
};

function insertTransaction(actor_id, target_id, amount, action, status, note, audience = "public") {
  let date_created = Date.now() / 1000;
  let date_completed = null;
  if (action === "pay") {
    date_completed = Date.now() / 1000;
  }

  pool.query(`INSERT INTO transactions 
    (actor_id, target_id, amount, action, status, note, date_created, date_completed, audience) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, // TODO: returning date? 
    [actor_id, target_id, amount, action, status, note, date_created, date_completed, audience], (err, result) => {
      if (err) {
        console.error(err);
        return null
      }
      return [date_created, date_completed];
    });
};

function updateBalance(id, newBalance) {
  pool.query(`UPDATE profiles SET balance = $1 WHERE id = $2`, [newBalance, id], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows[0];
  });
};

function getTransactionsForFriendsFeed(friendIDs, myID, before = null, after = null, limit, lastTransactionID = null) {
  pool.query(`
  SELECT *
  FROM transactions
  WHERE 
    AND (actor_id = ANY ($1::text[]) OR target_id = ANY ($1::text[]))
    AND (audience = 'friends' OR audience = 'public'
       OR (actor_id = $2 OR target_id = $2))
    AND status = 'settled'
    AND ($6 IS NULL OR id < $6)
    AND ($3 IS NULL OR date_completed < $3)
    AND ($4 IS NULL OR date_completed > $4)
  ORDER BY id DESC NULLS LAST
  LIMIT $5
  `, [friendIDs, myID, before, after, limit, lastTransactionID], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getMyRecentTransactions(myID, before = null, after = null, limit, lastTransactionID = null) {
  pool.query(`
  SELECT *
  FROM transactions
  WHERE (actor_id = $1 OR target_id = $1)
    AND status = 'settled'
    AND ($5 IS NULL OR id < $5)
    AND ($2 IS NULL OR date_completed < $2)
    AND ($3 IS NULL OR date_completed > $3)
  ORDER BY id DESC NULLS LAST
  LIMIT $4
  `, [myID, before, after, limit, lastTransactionID], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getTransactionFeedOfFriend(myID, friendID, before = null, after = null, limit, lastTransactionID = null) {
  pool.query(`
  SELECT *
  FROM transactions
  WHERE (audience = 'friends' OR audience = 'public' OR (actor_id = $1 AND target_id = $2) OR (actor_id = $2 AND target_id = $1))
    AND status = 'settled'
    AND ($6 IS NULL OR id < $6)
    AND ($3 IS NULL OR date_completed < $3)
    AND ($4 IS NULL OR date_completed > $4)
  ORDER BY id DESC NULLS LAST
  LIMIT $5
  `, [myID, friendID, before, after, limit, lastTransactionID], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getTransactionFeedOfUser(myID, partyID, before = null, after = null, limit, lastTransactionID = null) {
  pool.query(`
  SELECT *
  FROM transactions
  WHERE (audience = 'public' OR (actor_id = $1 AND target_id = $2) OR (actor_id = $2 AND target_id = $1))
    AND status = 'settled'
    AND ($6 IS NULL OR id < $6)
    AND ($3 IS NULL OR date_completed < $3)
    AND ($4 IS NULL OR date_completed > $4)
  ORDER BY id DESC NULLS LAST
  LIMIT $5
  `, [myID, partyID, before, after, limit, lastTransactionID], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getTransactionsBetweenUsers(myID, partyID, before = null, after = null, limit, lastTransactionID = null) {
  pool.query(`
  SELECT *
  FROM transactions
  WHERE (actor_id = $1 AND target_id = $2) OR (actor_id = $2 AND target_id = $1)
    AND status = 'settled'
    AND ($6 IS NULL OR id < $6)
    AND ($3 IS NULL OR date_completed < $3)
    AND ($4 IS NULL OR date_completed > $4)
  ORDER BY id DESC NULLS LAST
  LIMIT $5
  `, [myID, partyID, before, after, limit, lastTransactionID], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getOutstandingTransactions(myID, before = null, after = null, limit, lastTransactionID = null) {
  pool.query(`
  SELECT *
  FROM transactions
  WHERE (actor_id = $1 OR target_id = $1)
    AND status = 'pending'
    AND ($5 IS NULL OR id < $5)
    AND ($2 IS NULL OR date_completed < $2)
    AND ($3 IS NULL OR date_completed > $3)
  ORDER BY id DESC NULLS LAST
  LIMIT $4
  `, [myID, before, after, limit, lastTransactionID], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows;
  });
};

function getTransactionByID(id) {
  pool.query(`SELECT * FROM transactions WHERE id = $1`, [id], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows[0];
  });
};

function completeTransaction(id, status) {
  const dateCompleted = Date.now() / 1000;

  pool.query(`UPDATE transactions SET status = $1, date_completed = $2 WHERE id = $3`, 
  [status, dateCompleted, id], (err, result) => {
    if (err) {
      console.error(err);
      return null
    }
    return result.rows[0];
  });
};

module.exports = {
  pool: pool,
  getUserByID: getUserByID,
  getProfileByID: getProfileByID,
  getFriendsByID: getFriendsByID,
  getRelationshipRow: getRelationshipRow,
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
