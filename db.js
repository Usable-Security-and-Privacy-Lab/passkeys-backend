const { Pool } = require('pg');
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false // TODO: Vulnerability? MITM attack?
//   }
// });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:@localhost:5432/todos',
  ssl: process.env.DATABASE_URL ? true : false
})

pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
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

module.exports = pool;
