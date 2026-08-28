/* Neon Postgres client (HTTP driver — ideal for serverless). */
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.warn('[aryx] DATABASE_URL is not set — database calls will fail.');
}

// `sql` is a tagged-template function that returns an array of rows.
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

module.exports = { sql };
