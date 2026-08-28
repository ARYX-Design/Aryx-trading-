/* ============================================================
   Aryx — auth client (works with OR without a backend)

   • If the Vercel/Neon backend is deployed (/api/auth/*), all auth goes
     through it (real DB, email codes, HttpOnly session cookie).
   • If there is no backend (plain static deploy, or opening the file
     directly), it transparently falls back to a fully-working local
     auth stored in the browser: signup -> 6-digit code -> verify ->
     7-day trial -> session -> dashboard gating.

   Same flow and UI in both modes, so login always works.
   ============================================================ */
(function () {
  'use strict';

  var API = {
    signup: '/api/auth/signup', verify: '/api/auth/verify', resend: '/api/auth/resend',
    login: '/api/auth/login', logout: '/api/auth/logout', me: '/api/auth/me'
  };
  var TRIAL_DAYS = 7;
  var LS_USERS = 'aryx.users';
  var LS_SESSION = 'aryx.session';

  /* ---------- backend detection (cached) ----------
     "Usable" means the API functions are deployed AND the database is
     actually responding. If either is missing (no /api, or no DATABASE_URL,
     or a bad connection string), we use the browser fallback so login works. */
  var backendPromise = null;
  function hasBackend() {
    if (!backendPromise) {
      backendPromise = fetch('/api/health', { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) return false;
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('application/json') < 0) return false;
        return r.json().then(function (j) { return !!(j && j.db); }, function () { return false; });
      }).catch(function () { return false; });
    }
    return backendPromise;
  }

  function post(url, data) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(data || {})
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  /* ============================================================
     Local (browser) auth store — the no-backend fallback
     ============================================================ */
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function hash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); }
  function code6() {
    var n;
    if (window.crypto && crypto.getRandomValues) { var a = new Uint32Array(1); crypto.getRandomValues(a); n = a[0] % 1000000; }
    else n = Math.floor(Math.random() * 1000000);
    return String(n).padStart(6, '0');
  }
  function trialInfo(ends) {
    if (!ends) return { active: false, daysLeft: 0, endsAt: null };
    var ms = new Date(ends).getTime() - Date.now();
    return { active: ms > 0, daysLeft: Math.max(0, Math.ceil(ms / 86400000)), endsAt: new Date(ends).toISOString() };
  }
  // Grant a fresh trial to any account missing a valid one (self-heals
  // accounts created by older versions that never stored a trial date).
  function ensureTrial(u) {
    if (!u.trialEnds || isNaN(new Date(u.trialEnds).getTime())) {
      u.trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
      return true;
    }
    return false;
  }

  var Local = {
    signup: function (d) {
      var users = lsGet(LS_USERS, {});
      var email = d.email;
      if (users[email] && users[email].verified) return R(409, { error: 'already_registered' });
      var code = code6();
      users[email] = {
        name: d.name || email.split('@')[0], pass: hash(d.password), verified: false,
        trialEnds: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
        code: hash(code), codeExp: Date.now() + 15 * 60000
      };
      lsSet(LS_USERS, users);
      return R(200, { ok: true, needsVerification: true, devCode: code });
    },
    resend: function (d) {
      var users = lsGet(LS_USERS, {}); var u = users[d.email];
      if (!u || u.verified) return R(200, { ok: true });
      var code = code6(); u.code = hash(code); u.codeExp = Date.now() + 15 * 60000;
      lsSet(LS_USERS, users);
      return R(200, { ok: true, devCode: code });
    },
    verify: function (d) {
      var users = lsGet(LS_USERS, {}); var u = users[d.email];
      if (!u) return R(400, { error: 'no_pending_code' });
      if (Date.now() > u.codeExp) return R(400, { error: 'code_expired' });
      if (u.code !== hash(d.code)) return R(400, { error: 'wrong_code' });
      u.verified = true; u.code = null; lsSet(LS_USERS, users);
      lsSet(LS_SESSION, { email: d.email, name: u.name, at: Date.now() });
      return R(200, { ok: true, user: { email: d.email, name: u.name }, trial: trialInfo(u.trialEnds) });
    },
    login: function (d) {
      var users = lsGet(LS_USERS, {}); var u = users[d.email];
      if (!u || u.pass !== hash(d.password)) return R(401, { error: 'invalid_credentials' });
      if (!u.verified) return R(200, { ok: false, needsVerification: true, email: d.email });
      if (ensureTrial(u)) lsSet(LS_USERS, users);
      lsSet(LS_SESSION, { email: d.email, name: u.name, at: Date.now() });
      return R(200, { ok: true, user: { email: d.email, name: u.name }, trial: trialInfo(u.trialEnds) });
    },
    me: function () {
      var s = lsGet(LS_SESSION, null); if (!s) return { authed: false };
      var users = lsGet(LS_USERS, {}); var u = users[s.email];
      if (!u || !u.verified) return { authed: false };
      if (ensureTrial(u)) lsSet(LS_USERS, users);
      return { authed: true, user: { email: s.email, name: u.name }, trial: trialInfo(u.trialEnds) };
    },
    logout: function () { try { localStorage.removeItem(LS_SESSION); } catch (e) {} }
  };
  function R(status, body) { return Promise.resolve({ status: status, body: body }); }

  /* ---------- unified operations (backend or local) ----------
     Uses the real backend when usable; if a backend call errors or reports
     the DB isn't configured, it transparently falls back to local auth. */
  function op(name, data) {
    return hasBackend().then(function (has) {
      if (!has) return Local[name](data);
      return post(API[name], data).then(function (r) {
        var b = r.body || {};
        if (r.status >= 500 || b.error === 'db_not_configured') return Local[name](data);
        return r;
      }).catch(function () { return Local[name](data); });
    });
  }

  /* ---------- public API for app.js / nav ---------- */
  window.AryxAuth = {
    me: function () {
      return hasBackend().then(function (has) {
        if (!has) return Local.me();
        return fetch(API.me, { credentials: 'same-origin' })
          .then(function (r) { return r.json().catch(function () { return { authed: false }; }); })
          .catch(function () { return { authed: false }; });
      });
    },
    logout: function () {
      return hasBackend().then(function (has) { return has ? post(API.logout, {}) : (Local.logout(), R(200, { ok: true })); });
    }
  };

  /* ---------- reflect session in nav ---------- */
  var navCta = document.getElementById('navCta');
  var navInline = document.querySelector('.nav__inline-auth');
  if (navCta || navInline) {
    window.AryxAuth.me().then(function (d) {
      if (d && d.authed) {
        if (navCta) navCta.innerHTML =
          '<a href="app.html" class="btn btn--ghost">Dashboard</a>' +
          '<a href="app.html" class="btn btn--primary">Open trading view</a>';
        if (navInline) navInline.innerHTML =
          '<a href="app.html" class="btn btn--primary">Dashboard</a>';
      }
    });
  }

  /* ============================================================
     Modal wiring (only where present)
     ============================================================ */
  var modal = document.getElementById('authModal');
  if (!modal) return;

  var authView = document.getElementById('authView');
  var verifyView = document.getElementById('verifyView');
  var form = document.getElementById('authForm');
  var titleEl = document.getElementById('authTitle');
  var subEl = document.getElementById('authSub');
  var submitEl = document.getElementById('authSubmit');
  var nameField = document.getElementById('nameField');
  var errorEl = document.getElementById('authError');
  var switchText = document.getElementById('switchText');
  var switchLink = document.getElementById('switchLink');

  var nameInput = form.querySelector('[name=name]');
  var emailInput = form.querySelector('[name=email]');
  var passInput = form.querySelector('[name=password]');

  var verifyForm = document.getElementById('verifyForm');
  var verifyEmailEl = document.getElementById('verifyEmail');
  var codeInput = document.getElementById('codeInput');
  var verifyError = document.getElementById('verifyError');
  var verifySubmit = document.getElementById('verifySubmit');
  var devHint = document.getElementById('devHint');
  var resendLink = document.getElementById('resendLink');
  var backLink = document.getElementById('backLink');

  var ERRORS = {
    invalid_email: 'Please enter a valid email address.',
    weak_password: 'Password must be at least 6 characters.',
    already_registered: 'This email is already registered. Try signing in.',
    invalid_credentials: 'Invalid email or password.',
    no_pending_code: 'No pending code — please sign up again.',
    code_expired: 'That code expired. Request a new one.',
    wrong_code: 'Incorrect code. Please try again.',
    too_many_attempts: 'Too many attempts. Request a new code.'
  };
  function msg(c) { return ERRORS[c] || 'Something went wrong. Please try again.'; }

  var mode = 'signin';
  var pendingEmail = '';

  function showAuth() { authView.hidden = false; verifyView.hidden = true; }
  function showVerify(email, devCode) {
    pendingEmail = email; verifyEmailEl.textContent = email;
    verifyView.hidden = false; authView.hidden = true;
    verifyError.textContent = ''; codeInput.value = '';
    if (devCode) { devHint.hidden = false; devHint.textContent = 'Your code is ' + devCode + ' (shown here because email isn’t configured).'; codeInput.value = devCode; }
    else { devHint.hidden = true; }
    setTimeout(function () { codeInput.focus(); }, 60);
  }
  function setMode(next) {
    mode = next; var signup = mode === 'signup';
    titleEl.textContent = signup ? 'Create your account' : 'Welcome back';
    subEl.textContent = signup ? 'Start your 7-day free trial — no card required.' : 'Sign in to your trading dashboard.';
    submitEl.textContent = signup ? 'Create account' : 'Sign in';
    nameField.hidden = !signup;
    switchText.textContent = signup ? 'Already have an account?' : "Don't have an account?";
    switchLink.textContent = signup ? 'Sign in' : 'Create one — 7 days free';
    errorEl.textContent = '';
    passInput.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  }
  function open(next) { setMode(next || 'signin'); showAuth(); modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; setTimeout(function () { (mode === 'signup' ? nameInput : emailInput).focus(); }, 60); }
  function close() { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }

  document.querySelectorAll('[data-auth]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); open(el.getAttribute('data-auth')); });
  });
  modal.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', close); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
  switchLink.addEventListener('click', function (e) { e.preventDefault(); setMode(mode === 'signup' ? 'signin' : 'signup'); });
  backLink.addEventListener('click', function (e) { e.preventDefault(); showAuth(); });

  function redirect() { setTimeout(function () { window.location.href = 'app.html'; }, 350); }

  form.addEventListener('submit', function (e) {
    e.preventDefault(); errorEl.textContent = '';
    var email = (emailInput.value || '').trim().toLowerCase();
    var pass = passInput.value || '';
    var name = (nameInput.value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errorEl.textContent = 'Please enter a valid email address.'; return; }
    if (pass.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; return; }

    var busy = submitEl.textContent; submitEl.disabled = true; submitEl.textContent = 'Please wait…';
    var run = mode === 'signup' ? op('signup', { name: name, email: email, password: pass }) : op('login', { email: email, password: pass });

    run.then(function (r) {
      submitEl.disabled = false; submitEl.textContent = busy;
      var b = r.body || {};
      if (mode === 'signup') {
        if (b.ok && b.needsVerification) { showVerify(email, b.devCode); return; }
        errorEl.textContent = msg(b.error);
      } else {
        if (b.ok) { redirect(); return; }
        if (b.needsVerification) { op('resend', { email: email }).then(function (rr) { showVerify(email, (rr.body || {}).devCode); }); return; }
        errorEl.textContent = msg(b.error);
      }
    }).catch(function () { submitEl.disabled = false; submitEl.textContent = busy; errorEl.textContent = 'Something went wrong. Please try again.'; });
  });

  verifyForm.addEventListener('submit', function (e) {
    e.preventDefault(); verifyError.textContent = '';
    var code = (codeInput.value || '').trim();
    if (!/^\d{6}$/.test(code)) { verifyError.textContent = 'Enter the 6-digit code.'; return; }
    var busy = verifySubmit.textContent; verifySubmit.disabled = true; verifySubmit.textContent = 'Verifying…';
    op('verify', { email: pendingEmail, code: code }).then(function (r) {
      var b = r.body || {};
      if (b.ok) { verifySubmit.textContent = 'Success! Loading…'; redirect(); return; }
      verifySubmit.disabled = false; verifySubmit.textContent = busy; verifyError.textContent = msg(b.error);
    }).catch(function () { verifySubmit.disabled = false; verifySubmit.textContent = busy; verifyError.textContent = 'Something went wrong. Please try again.'; });
  });

  resendLink.addEventListener('click', function (e) {
    e.preventDefault(); verifyError.textContent = ''; resendLink.textContent = 'Sending…';
    op('resend', { email: pendingEmail }).then(function (r) {
      resendLink.textContent = 'Resend code';
      var b = r.body || {};
      if (b.devCode) { devHint.hidden = false; devHint.textContent = 'Your new code is ' + b.devCode + '.'; codeInput.value = b.devCode; }
      else { devHint.hidden = false; devHint.textContent = 'A new code is on its way to ' + pendingEmail + '.'; }
    }).catch(function () { resendLink.textContent = 'Resend code'; verifyError.textContent = 'Could not resend. Try again.'; });
  });

  var hash0 = (location.hash || '').replace('#', '');
  if (hash0 === 'signin' || hash0 === 'signup') open(hash0);
})();
