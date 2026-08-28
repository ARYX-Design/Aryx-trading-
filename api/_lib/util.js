/* Shared helpers: crypto (password hashing + signed session tokens),
   HTTP helpers, and cookie handling. Uses only Node built-ins — no
   extra dependencies, works on Vercel's Node runtime. */
const crypto = require('crypto');

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'aryx-dev-secret-change-me-in-production-please-0000000000';
const SESSION_COOKIE = 'aryx_session';
const SESSION_DAYS = 30;
const TRIAL_DAYS = 7;

/* ---------- password hashing (scrypt) ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(pw), salt, 64);
  return salt.toString('hex') + ':' + dk.toString('hex');
}
function verifyPassword(pw, stored) {
  try {
    const [s, h] = String(stored).split(':');
    const dk = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64);
    const hb = Buffer.from(h, 'hex');
    return dk.length === hb.length && crypto.timingSafeEqual(dk, hb);
  } catch (e) { return false; }
}

/* ---------- verification codes ---------- */
function makeCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/* ---------- signed session token (HMAC) ---------- */
function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}
function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  return body + '.' + sig;
}
function verifySession(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  const a = Buffer.from(sig || ''); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(b64urlDecode(body));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}

/* ---------- cookies ---------- */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader('Set-Cookie',
    SESSION_COOKIE + '=' + token +
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + maxAge);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    SESSION_COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}
function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  return verifySession(token);
}

/* ---------- HTTP helpers ---------- */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise(function (resolve) {
    let data = '';
    req.on('data', function (c) { data += c; });
    req.on('end', function () { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}
function json(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

/* ---------- trial helpers ---------- */
function trialInfo(trialEndsAt) {
  if (!trialEndsAt) return { active: false, daysLeft: 0, endsAt: null };
  const ends = new Date(trialEndsAt).getTime();
  const msLeft = ends - Date.now();
  return {
    active: msLeft > 0,
    daysLeft: Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))),
    endsAt: new Date(ends).toISOString()
  };
}

module.exports = {
  SESSION_COOKIE, SESSION_DAYS, TRIAL_DAYS,
  hashPassword, verifyPassword, makeCode, hashCode,
  signSession, verifySession, setSessionCookie, clearSessionCookie, getSession, parseCookies,
  readBody, json, normalizeEmail, validEmail, trialInfo
};
