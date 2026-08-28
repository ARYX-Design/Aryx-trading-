/* One-time database setup. Call once after deploy:
     GET /api/init?secret=YOUR_INIT_SECRET
   Requires the INIT_SECRET env var to match. Safe to run repeatedly
   (CREATE TABLE IF NOT EXISTS). */
const { sql } = require('./_lib/db');
const { json } = require('./_lib/util');

module.exports = async function handler(req, res) {
  if (!process.env.INIT_SECRET) return json(res, 500, { error: 'INIT_SECRET not configured' });
  if ((req.query && req.query.secret) !== process.env.INIT_SECRET)
    return json(res, 403, { error: 'forbidden' });
  if (!sql) return json(res, 500, { error: 'DATABASE_URL not configured' });

  try {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      name text,
      password_hash text NOT NULL,
      email_verified boolean NOT NULL DEFAULT false,
      trial_ends_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS verification_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      code_hash text NOT NULL,
      attempts int NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL,
      consumed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_codes_email ON verification_codes (email)`;
    return json(res, 200, { ok: true, message: 'Database initialized.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'init_failed', detail: String(e.message || e) });
  }
};
