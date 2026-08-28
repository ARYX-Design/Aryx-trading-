/* ============================================================
   Aryx — client-side demo auth
   NOTE: This is a front-end demo. "Accounts" live in localStorage;
   there is no server and no real trading. Passwords are lightly
   hashed only to avoid storing plain text in the demo store.
   ============================================================ */
(function () {
  'use strict';

  var KEY_USERS = 'aryx.users';
  var KEY_SESSION = 'aryx.session';

  /* ---- tiny helpers ---- */
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  // non-cryptographic hash — demo only, keeps passwords out of plain text
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }

  window.AryxAuth = {
    session: function () { return read(KEY_SESSION, null); },
    logout: function () { try { localStorage.removeItem(KEY_SESSION); } catch (e) {} }
  };

  /* ---- modal wiring (only on pages that have it) ---- */
  var modal = document.getElementById('authModal');
  if (!modal) return;

  var form = document.getElementById('authForm');
  var titleEl = document.getElementById('authTitle');
  var subEl = document.getElementById('authSub');
  var submitEl = document.getElementById('authSubmit');
  var nameField = document.getElementById('nameField');
  var errorEl = document.getElementById('authError');
  var switchText = document.getElementById('switchText');
  var switchLink = document.getElementById('switchLink');
  var mode = 'signin';

  function setMode(next) {
    mode = next;
    var signup = mode === 'signup';
    titleEl.textContent = signup ? 'Create your account' : 'Welcome back';
    subEl.textContent = signup
      ? 'Start your 14-day free trial — no card required.'
      : 'Sign in to your trading dashboard.';
    submitEl.textContent = signup ? 'Create account' : 'Sign in';
    nameField.hidden = !signup;
    switchText.textContent = signup ? 'Already have an account?' : "Don't have an account?";
    switchLink.textContent = signup ? 'Sign in' : 'Create one';
    errorEl.textContent = '';
    form.querySelector('[name=password]').setAttribute(
      'autocomplete', signup ? 'new-password' : 'current-password'
    );
  }

  function open(next) {
    setMode(next || 'signin');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      var first = mode === 'signup' ? form.name : form.email;
      if (first) first.focus();
    }, 60);
  }
  function close() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // open triggers
  document.querySelectorAll('[data-auth]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open(el.getAttribute('data-auth'));
    });
  });
  // close triggers
  modal.querySelectorAll('[data-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });
  switchLink.addEventListener('click', function (e) {
    e.preventDefault();
    setMode(mode === 'signup' ? 'signin' : 'signup');
  });

  /* ---- submit ---- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';
    var email = (form.email.value || '').trim().toLowerCase();
    var pass = form.password.value || '';
    var name = (form.name.value || '').trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errorEl.textContent = 'Please enter a valid email address.'; return;
    }
    if (pass.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters.'; return;
    }

    var users = read(KEY_USERS, {});

    if (mode === 'signup') {
      if (users[email]) { errorEl.textContent = 'An account with this email already exists. Try signing in.'; return; }
      users[email] = { name: name || email.split('@')[0], pass: hash(pass), created: Date.now() };
      write(KEY_USERS, users);
    } else {
      var u = users[email];
      if (!u || u.pass !== hash(pass)) {
        errorEl.textContent = 'Invalid email or password.'; return;
      }
    }

    var display = (users[email] && users[email].name) || email.split('@')[0];
    write(KEY_SESSION, { email: email, name: display, at: Date.now() });
    submitEl.textContent = 'Loading dashboard…';
    setTimeout(function () { window.location.href = 'app.html'; }, 450);
  });

  /* ---- reflect logged-in state in the nav ---- */
  var session = window.AryxAuth.session();
  var navCta = document.getElementById('navCta');
  if (session && navCta) {
    navCta.innerHTML =
      '<a href="app.html" class="btn btn--ghost">Dashboard</a>' +
      '<a href="app.html" class="btn btn--primary">Open trading view</a>';
  }
})();
