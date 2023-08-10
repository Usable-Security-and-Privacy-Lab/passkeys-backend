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
    balance REAL DEFAULT 1000.00
  )
`);

pool.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    payer_id INTEGER NOT NULL,
    payee_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL,
    date_created INTEGER NOT NULL,
    date_completed INTEGER,
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

module.exports = {
  pool: pool,
  getUserByID: getUserByID,
  getProfileByID: getProfileByID,
  getFriendsByID: getFriendsByID,
  getRelationshipRow: getRelationshipRow,
};
