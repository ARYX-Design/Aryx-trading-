/* POST /api/auth/login  { email, password }
   Verifies credentials. If the email isn't verified yet, returns
   needsVerification so the client can prompt for the code. Otherwise
   issues a session cookie. */
const { sql } = require('../_lib/db');
const {
  readBody, json, normalizeEmail, verifyPassword,
  signSession, setSessionCookie, trialInfo, SESSION_DAYS
} = require('../_lib/util');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!sql) return json(res, 500, { error: 'db_not_configured' });

  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) return json(res, 400, { error: 'invalid_input' });

  try {
    const rows = await sql`SELECT id, email, name, password_hash, email_verified, trial_ends_at
      FROM users WHERE email = ${email}`;
    if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
      return json(res, 401, { error: 'invalid_credentials' });
    }
    const u = rows[0];

    if (!u.email_verified) {
      return json(res, 200, { ok: false, needsVerification: true, email: u.email });
    }

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
    return json(res, 500, { error: 'login_failed' });
  }
};
