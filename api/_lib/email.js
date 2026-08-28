/* Sends the verification code by email via Resend (https://resend.com).
   If RESEND_API_KEY / EMAIL_FROM are not configured, it runs in DEV mode:
   the code is logged and returned to the client so you can test without an
   email provider. In production, set both env vars and the code is only
   ever delivered by email. */

async function sendVerificationEmail(email, code) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // e.g. "Aryx <noreply@yourdomain.com>"

  if (!key || !from) {
    console.log('[aryx][DEV] verification code for ' + email + ' = ' + code);
    return { sent: false, devCode: code };
  }

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070a12;padding:32px;color:#eaf0fb">
      <div style="max-width:440px;margin:auto;background:#101725;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px">
        <h2 style="margin:0 0 6px">Verify your email</h2>
        <p style="color:#9aa7c2;margin:0 0 24px">Enter this code to activate your Aryx account and start your 7-day free trial.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;
             background:linear-gradient(120deg,#00e0a4,#4d7cff);-webkit-background-clip:text;background-clip:text;color:transparent">
          ${code}
        </div>
        <p style="color:#6b7896;font-size:13px;margin-top:24px">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: email,
        subject: 'Your Aryx verification code: ' + code,
        html: html
      })
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('[aryx] Resend error', r.status, t);
      return { sent: false, error: 'email_failed' };
    }
    return { sent: true };
  } catch (e) {
    console.error('[aryx] Resend exception', e);
    return { sent: false, error: 'email_failed' };
  }
}

module.exports = { sendVerificationEmail };
