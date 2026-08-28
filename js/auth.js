/* ============================================================
   Aryx — auth client
   Talks to the Vercel/Neon backend under /api/auth/*.
   Flow: sign up -> email code -> verify -> session cookie -> dashboard.
   Also handles login, resend, and reflecting session state in the nav.
   ============================================================ */
(function () {
  'use strict';

  var API = {
    signup: '/api/auth/signup',
    verify: '/api/auth/verify',
    resend: '/api/auth/resend',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me'
  };

  function post(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data || {})
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  var ERRORS = {
    invalid_email: 'Please enter a valid email address.',
    weak_password: 'Password must be at least 6 characters.',
    already_registered: 'This email is already registered. Try signing in.',
    invalid_credentials: 'Invalid email or password.',
    no_pending_code: 'No pending code — please sign up again.',
    code_expired: 'That code expired. Request a new one.',
    wrong_code: 'Incorrect code. Please try again.',
    too_many_attempts: 'Too many attempts. Request a new code.',
    db_not_configured: 'Backend not configured yet. See README to connect Neon.',
    signup_failed: 'Something went wrong. Please try again.',
    login_failed: 'Something went wrong. Please try again.',
    verify_failed: 'Something went wrong. Please try again.'
  };
  function msg(code) { return ERRORS[code] || 'Something went wrong. Please try again.'; }

  /* public API used by app.js.
     me() distinguishes a missing backend (static deploy) from a real
     "not signed in" via `backend`, so the dashboard can run as a public
     demo when there's no API. */
  window.AryxAuth = {
    me: function () {
      return fetch(API.me, { credentials: 'same-origin' }).then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (r.status === 404 || ct.indexOf('application/json') < 0) return { backend: false, authed: false };
        return r.json().then(function (j) { j.backend = true; return j; }, function () { return { backend: false, authed: false }; });
      }).catch(function () { return { backend: false, authed: false }; });
    },
    logout: function () { return post(API.logout, {}); }
  };

  /* ---- reflect session in nav (best-effort) ---- */
  var navCta = document.getElementById('navCta');
  if (navCta) {
    window.AryxAuth.me().then(function (d) {
      if (d && d.authed) {
        navCta.innerHTML =
          '<a href="app.html" class="btn btn--ghost">Dashboard</a>' +
          '<a href="app.html" class="btn btn--primary">Open trading view</a>';
      }
    }).catch(function () {});
  }

  /* ---- modal (only where present) ---- */
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

  // explicit input refs — `form.name` collides with HTMLFormElement.name,
  // so never access the name field via form.name
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

  var mode = 'signin';
  var pendingEmail = '';

  function showAuth() { authView.hidden = false; verifyView.hidden = true; }
  function showVerify(email, devCode) {
    pendingEmail = email;
    verifyEmailEl.textContent = email;
    verifyView.hidden = false;
    authView.hidden = true;
    verifyError.textContent = '';
    codeInput.value = '';
    if (devCode) {
      devHint.hidden = false;
      devHint.textContent = 'Dev mode (no email provider set): your code is ' + devCode;
      codeInput.value = devCode;
    } else {
      devHint.hidden = true;
    }
    setTimeout(function () { codeInput.focus(); }, 60);
  }

  function setMode(next) {
    mode = next;
    var signup = mode === 'signup';
    titleEl.textContent = signup ? 'Create your account' : 'Welcome back';
    subEl.textContent = signup
      ? 'Start your 7-day free trial — no card required.'
      : 'Sign in to your trading dashboard.';
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

  /* ---- sign in / sign up submit ---- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';
    var email = (emailInput.value || '').trim().toLowerCase();
    var pass = passInput.value || '';
    var name = (nameInput.value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errorEl.textContent = 'Please enter a valid email address.'; return; }
    if (pass.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; return; }

    var busy = submitEl.textContent;
    submitEl.disabled = true; submitEl.textContent = 'Please wait…';

    var req = mode === 'signup'
      ? post(API.signup, { name: name, email: email, password: pass })
      : post(API.login, { email: email, password: pass });

    req.then(function (r) {
      submitEl.disabled = false; submitEl.textContent = busy;
      var b = r.body || {};
      if (mode === 'signup') {
        if (b.ok && b.needsVerification) { showVerify(email, b.devCode); return; }
        errorEl.textContent = msg(b.error);
      } else {
        if (b.ok) { redirect(); return; }
        if (b.needsVerification) {
          // credentials fine but not verified — send a fresh code and prompt
          post(API.resend, { email: email }).then(function (rr) { showVerify(email, (rr.body || {}).devCode); });
          return;
        }
        errorEl.textContent = msg(b.error);
      }
    }).catch(function () {
      submitEl.disabled = false; submitEl.textContent = busy;
      errorEl.textContent = 'Cannot reach the server. Is the backend deployed?';
    });
  });

  /* ---- verify submit ---- */
  verifyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    verifyError.textContent = '';
    var code = (codeInput.value || '').trim();
    if (!/^\d{6}$/.test(code)) { verifyError.textContent = 'Enter the 6-digit code.'; return; }

    var busy = verifySubmit.textContent;
    verifySubmit.disabled = true; verifySubmit.textContent = 'Verifying…';
    post(API.verify, { email: pendingEmail, code: code }).then(function (r) {
      var b = r.body || {};
      if (b.ok) { verifySubmit.textContent = 'Success! Loading…'; redirect(); return; }
      verifySubmit.disabled = false; verifySubmit.textContent = busy;
      verifyError.textContent = msg(b.error);
    }).catch(function () {
      verifySubmit.disabled = false; verifySubmit.textContent = busy;
      verifyError.textContent = 'Cannot reach the server. Please try again.';
    });
  });

  resendLink.addEventListener('click', function (e) {
    e.preventDefault();
    verifyError.textContent = '';
    resendLink.textContent = 'Sending…';
    post(API.resend, { email: pendingEmail }).then(function (r) {
      resendLink.textContent = 'Resend code';
      var b = r.body || {};
      if (b.devCode) { devHint.hidden = false; devHint.textContent = 'Dev mode: your new code is ' + b.devCode; codeInput.value = b.devCode; }
      else { devHint.hidden = false; devHint.textContent = 'A new code is on its way to ' + pendingEmail + '.'; }
    }).catch(function () { resendLink.textContent = 'Resend code'; verifyError.textContent = 'Could not resend. Try again.'; });
  });

  function redirect() { setTimeout(function () { window.location.href = 'app.html'; }, 350); }

  /* open automatically if arriving with #signin / #signup */
  var hash = (location.hash || '').replace('#', '');
  if (hash === 'signin' || hash === 'signup') open(hash);
})();
