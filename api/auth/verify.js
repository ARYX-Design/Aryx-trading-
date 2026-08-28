/* POST /api/auth/verify  { email, code }
   Validates the 6-digit code, marks the account verified, and issues a
   session cookie. Returns the user + trial status. */
const { sql } = require('../_lib/db');
const {
  readBody, json, normalizeEmail, hashCode,
  signSession, setSessionCookie, trialInfo, SESSION_DAYS
} = require('../_lib/util');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!sql) return json(res, 500, { error: 'db_not_configured' });

  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();

  if (!email || !/^\d{6}$/.test(code)) return json(res, 400, { error: 'invalid_input' });

  try {
    const rows = await sql`SELECT id, code_hash, attempts, expires_at, consumed
      FROM verification_codes
      WHERE email = ${email} AND consumed = false
      ORDER BY created_at DESC LIMIT 1`;

    if (!rows.length) return json(res, 400, { error: 'no_pending_code' });
    const rec = rows[0];

    if (new Date(rec.expires_at).getTime() < Date.now())
      return json(res, 400, { error: 'code_expired' });
    if (rec.attempts >= 6)
      return json(res, 429, { error: 'too_many_attempts' });

    if (rec.code_hash !== hashCode(code)) {
      await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${rec.id}`;
      return json(res, 400, { error: 'wrong_code' });
    }

    await sql`UPDATE verification_codes SET consumed = true WHERE id = ${rec.id}`;
    const users = await sql`UPDATE users SET email_verified = true
      WHERE email = ${email}
      RETURNING id, email, name, trial_ends_at`;
    if (!users.length) return json(res, 404, { error: 'user_not_found' });
    const u = users[0];

    const token = signSession({
      uid: u.id, email: u.email,
      exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    });
    setSessionCookie(res, token);

    return json(res, 200, {
      ok: true,
      user: { email: u.email, name: u.name },
      trial: trialInfo(u.trial_ends_at)
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'verify_failed' });
  }
};
