/* POST /api/auth/signup  { name, email, password }
   Creates an unverified account (or reuses an existing unverified one),
   sets the 7-day trial window, generates a 6-digit code, and emails it.
   Returns { ok, needsVerification, devCode? }. */
const { sql } = require('../_lib/db');
const { sendVerificationEmail } = require('../_lib/email');
const {
  readBody, json, normalizeEmail, validEmail,
  hashPassword, makeCode, hashCode, TRIAL_DAYS
} = require('../_lib/util');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!sql) return json(res, 500, { error: 'db_not_configured' });

  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const name = String(body.name || '').trim().slice(0, 80);

  if (!validEmail(email)) return json(res, 400, { error: 'invalid_email' });
  if (password.length < 6) return json(res, 400, { error: 'weak_password' });

  try {
    const existing = await sql`SELECT id, email_verified FROM users WHERE email = ${email}`;
    if (existing.length && existing[0].email_verified) {
      return json(res, 409, { error: 'already_registered' });
    }

    const pwHash = hashPassword(password);
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    if (existing.length) {
      // unverified account exists — update credentials and refresh trial
      await sql`UPDATE users
        SET name = ${name || null}, password_hash = ${pwHash}, trial_ends_at = ${trialEnds}
        WHERE email = ${email}`;
    } else {
      await sql`INSERT INTO users (email, name, password_hash, trial_ends_at)
        VALUES (${email}, ${name || null}, ${pwHash}, ${trialEnds})`;
    }

    // issue a fresh verification code
    const code = makeCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await sql`UPDATE verification_codes SET consumed = true WHERE email = ${email} AND consumed = false`;
    await sql`INSERT INTO verification_codes (email, code_hash, expires_at)
      VALUES (${email}, ${hashCode(code)}, ${expires})`;

    const mail = await sendVerificationEmail(email, code);

    return json(res, 200, {
      ok: true,
      needsVerification: true,
      emailSent: !!mail.sent,
      devCode: mail.devCode // present only in DEV mode (no email provider configured)
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'signup_failed' });
  }
};
