/* POST /api/auth/resend  { email }
   Issues a fresh verification code for an unverified account. Always
   responds ok (does not reveal whether the account exists). */
const { sql } = require('../_lib/db');
const { sendVerificationEmail } = require('../_lib/email');
const { readBody, json, normalizeEmail, validEmail, makeCode, hashCode } = require('../_lib/util');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!sql) return json(res, 500, { error: 'db_not_configured' });

  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return json(res, 400, { error: 'invalid_email' });

  try {
    const u = await sql`SELECT email_verified FROM users WHERE email = ${email}`;
    if (!u.length || u[0].email_verified) {
      return json(res, 200, { ok: true }); // don't leak account state
    }

    const code = makeCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await sql`UPDATE verification_codes SET consumed = true WHERE email = ${email} AND consumed = false`;
    await sql`INSERT INTO verification_codes (email, code_hash, expires_at)
      VALUES (${email}, ${hashCode(code)}, ${expires})`;

    const mail = await sendVerificationEmail(email, code);
    return json(res, 200, { ok: true, emailSent: !!mail.sent, devCode: mail.devCode });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'resend_failed' });
  }
};
