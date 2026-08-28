/* GET /api/health
   Reports whether the backend is fully usable — i.e. the database is
   configured AND actually responding. The frontend uses this to decide
   between real-backend auth and the built-in browser fallback, so login
   works whether or not Neon is connected. */
const { sql } = require('./_lib/db');
const { json } = require('./_lib/util');

module.exports = async function handler(req, res) {
  var db = false;
  if (sql) {
    try { await sql`SELECT 1`; db = true; } catch (e) { db = false; }
  }
  return json(res, 200, { ok: true, db: db });
};
