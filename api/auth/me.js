/* GET /api/auth/me
   Returns the current session user + trial status, or 401 if not signed in. */
const { sql } = require('../_lib/db');
const { json, getSession, trialInfo } = require('../_lib/util');

module.exports = async function handler(req, res) {
  const s = getSession(req);
  if (!s) return json(res, 401, { authed: false });
  if (!sql) return json(res, 500, { error: 'db_not_configured' });

  try {
    const rows = await sql`SELECT email, name, email_verified, trial_ends_at
      FROM users WHERE id = ${s.uid}`;
    if (!rows.length) return json(res, 401, { authed: false });
    const u = rows[0];
    return json(res, 200, {
      authed: true,
      user: { email: u.email, name: u.name, emailVerified: u.email_verified },
      trial: trialInfo(u.trial_ends_at)
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'me_failed' });
  }
};
