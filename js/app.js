/* ============================================================
   Aryx — Trading Dashboard engine
   Candlestick chart + real indicator math (EMA, Bollinger,
   VWAP, RSI, MACD), toggleable overlays, live simulated data.
   Demo only — no real market feed or trading.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- auth gate + trial ----------
     - Backend present + signed in  -> show name, trial pill; block if expired
     - Backend present + not signed  -> redirect to sign in
     - Backend absent (static demo)  -> run as public "Guest" demo         */
  var helloEl = document.getElementById('userHello');
  var trialPill = document.getElementById('trialPill');
  var trialGate = document.getElementById('trialGate');

  function doLogout() {
    var done = function () { window.location.href = 'index.html'; };
    if (window.AryxAuth && window.AryxAuth.logout) window.AryxAuth.logout().then(done, done);
    else done();
  }
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  var gateLogout = document.getElementById('gateLogout');
  if (gateLogout) gateLogout.addEventListener('click', doLogout);

  function applyTrial(t) {
    if (!t || !trialPill) return;
    if (t.active) {
      trialPill.hidden = false;
      trialPill.textContent = t.daysLeft + (t.daysLeft === 1 ? ' day left' : ' days left') + ' · Trial';
      trialPill.className = 'trialpill' + (t.daysLeft <= 2 ? ' trialpill--warn' : '');
    } else {
      trialPill.hidden = false;
      trialPill.textContent = 'Trial ended';
      trialPill.className = 'trialpill trialpill--warn';
      if (trialGate) trialGate.hidden = false; // block the dashboard
    }
  }

  if (window.AryxAuth && window.AryxAuth.me) {
    window.AryxAuth.me().then(function (d) {
      if (!d.backend) { if (helloEl) helloEl.textContent = 'Guest'; return; } // static demo
      if (d.authed) {
        if (helloEl) helloEl.textContent = (d.user && d.user.name) || 'Trader';
        applyTrial(d.trial);
      } else {
        window.location.href = 'index.html#signin'; // require sign in
      }
    });
  } else if (helloEl) {
    helloEl.textContent = 'Guest';
  }

  /* ---------- symbol config ----------
     `binance` pairs stream real live data; others fall back to simulation.
     Sim params (base/vol/dec/seed) are also used if a live fetch fails. */
  var SYMBOLS = {
    BTC:  { label: 'BTC/USDT', binance: 'BTCUSDT', base: 63500, vol: 0.011, dec: 2, seed: 11 },
    ETH:  { label: 'ETH/USDT', binance: 'ETHUSDT', base: 3120,  vol: 0.013, dec: 2, seed: 23 },
    SOL:  { label: 'SOL/USDT', binance: 'SOLUSDT', base: 168,   vol: 0.018, dec: 2, seed: 29 },
    XAU:  { label: 'Gold · PAXG', binance: 'PAXGUSDT', base: 2380, vol: 0.005, dec: 2, seed: 53 },
    AAPL: { label: 'AAPL',     binance: null, base: 224,  vol: 0.008, dec: 2, seed: 37 },
    XAG:  { label: 'Silver (XAG)', binance: null, base: 29.4, vol: 0.009, dec: 2, seed: 67 }
  };
  var TF_DRIFT = { '15m': 0.6, '1H': 1, '4H': 1.7, '1D': 2.6 };
  var TF_INTERVAL = { '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d' };
  var N = 150;

  var state = {
    symbol: 'BTC',
    tf: '1H',
    candles: [],
    show: { ema: true, boll: true, vwap: false, rsi: true, macd: true },
    pnl: 0,
    posSign: 0
  };

  /* ---------- seeded RNG (deterministic per symbol) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function genSeries(symKey, tf) {
    var cfg = SYMBOLS[symKey];
    var rnd = mulberry32(cfg.seed * 100 + (tf.charCodeAt(0)));
    var vol = cfg.vol * TF_DRIFT[tf];
    var price = cfg.base;
    var out = [];
    for (var i = 0; i < N; i++) {
      var trend = Math.sin(i / 18) * price * vol * 0.4;
      var drift = (rnd() - 0.5) * price * vol * 2 + trend;
      var open = price;
      var close = Math.max(open + drift, open * 0.85);
      var hi = Math.max(open, close) + rnd() * price * vol * 0.9;
      var lo = Math.min(open, close) - rnd() * price * vol * 0.9;
      var v = 1 + rnd() * 3;
      out.push({ o: open, h: hi, l: lo, c: close, v: v });
      price = close;
    }
    return out;
  }

  /* ============================================================
     Indicator math
     ============================================================ */
  function ema(values, period) {
    var k = 2 / (period + 1);
    var out = new Array(values.length).fill(null);
    var sum = 0, prev = null;
    for (var i = 0; i < values.length; i++) {
      if (i < period) {
        sum += values[i];
        if (i === period - 1) { prev = sum / period; out[i] = prev; }
      } else {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  }
  function sma(values, period) {
    var out = new Array(values.length).fill(null);
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }
  function bollinger(values, period, mult) {
    var mid = sma(values, period);
    var up = new Array(values.length).fill(null);
    var lo = new Array(values.length).fill(null);
    for (var i = period - 1; i < values.length; i++) {
      var m = mid[i], s = 0;
      for (var j = i - period + 1; j <= i; j++) s += Math.pow(values[j] - m, 2);
      var sd = Math.sqrt(s / period);
      up[i] = m + mult * sd; lo[i] = m - mult * sd;
    }
    return { mid: mid, up: up, lo: lo };
  }
  function vwap(candles) {
    var out = [], cumPV = 0, cumV = 0;
    for (var i = 0; i < candles.length; i++) {
      var tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
      cumPV += tp * candles[i].v; cumV += candles[i].v;
      out.push(cumPV / cumV);
    }
    return out;
  }
  function rsi(values, period) {
    var out = new Array(values.length).fill(null);
    var gain = 0, loss = 0;
    for (var i = 1; i <= period; i++) {
      var d = values[i] - values[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= period; loss /= period;
    out[period] = 100 - 100 / (1 + gain / (loss || 1e-9));
    for (var k = period + 1; k < values.length; k++) {
      var ch = values[k] - values[k - 1];
      var g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[k] = 100 - 100 / (1 + gain / (loss || 1e-9));
    }
    return out;
  }
  function macd(values) {
    var f = ema(values, 12), s = ema(values, 26);
    var line = values.map(function (_, i) {
      return (f[i] != null && s[i] != null) ? f[i] - s[i] : null;
    });
    var compact = line.filter(function (x) { return x != null; });
    var sig9 = ema(compact, 9);
    var signal = new Array(values.length).fill(null);
    var off = line.findIndex(function (x) { return x != null; });
    for (var i = 0; i < sig9.length; i++) if (sig9[i] != null) signal[off + i] = sig9[i];
    var hist = values.map(function (_, i) {
      return (line[i] != null && signal[i] != null) ? line[i] - signal[i] : null;
    });
    return { line: line, signal: signal, hist: hist };
  }

  /* ============================================================
     Canvas helpers
     ============================================================ */
  function setup(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }
  function line(ctx, xs, ys, color, width) {
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < ys.length; i++) {
      if (ys[i] == null) { started = false; continue; }
      var x = xs(i), y = ys[i];
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.4; ctx.stroke();
  }

  /* ============================================================
     Renderers
     ============================================================ */
  var elMain = document.getElementById('mainChart');
  var elRsi = document.getElementById('rsiChart');
  var elMacd = document.getElementById('macdChart');

  function computeAll() {
    var closes = state.candles.map(function (c) { return c.c; });
    return {
      closes: closes,
      ema9: ema(closes, 9), ema21: ema(closes, 21), ema50: ema(closes, 50),
      boll: bollinger(closes, 20, 2),
      vwap: vwap(state.candles),
      rsi: rsi(closes, 14),
      macd: macd(closes)
    };
  }

  function drawMain(ind) {
    var s = setup(elMain), ctx = s.ctx, w = s.w, h = s.h;
    ctx.clearRect(0, 0, w, h);
    var padR = 54, padT = 12, padB = 12;
    var c = state.candles;

    var min = Infinity, max = -Infinity;
    for (var i = 0; i < c.length; i++) { if (c[i].l < min) min = c[i].l; if (c[i].h > max) max = c[i].h; }
    if (state.show.boll) for (i = 0; i < c.length; i++) {
      if (ind.boll.up[i] != null && ind.boll.up[i] > max) max = ind.boll.up[i];
      if (ind.boll.lo[i] != null && ind.boll.lo[i] < min) min = ind.boll.lo[i];
    }
    var pad = (max - min) * 0.08; min -= pad; max += pad;
    var range = max - min || 1;
    var plotW = w - padR;
    var step = plotW / c.length;
    var xs = function (i) { return i * step + step / 2; };
    var y = function (p) { return padT + (1 - (p - min) / range) * (h - padT - padB); };

    // grid + price axis
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.fillStyle = 'rgba(154,167,194,0.7)';
    ctx.font = '10px JetBrains Mono, monospace'; ctx.textBaseline = 'middle';
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
      var pv = max - (g / 4) * range;
      ctx.fillText(fmtPrice(pv), plotW + 6, gy);
    }

    // Bollinger fill
    if (state.show.boll) {
      ctx.beginPath();
      var open = false;
      for (i = 0; i < c.length; i++) { if (ind.boll.up[i] == null) continue; var x = xs(i); if (!open) { ctx.moveTo(x, y(ind.boll.up[i])); open = true; } else ctx.lineTo(x, y(ind.boll.up[i])); }
      for (i = c.length - 1; i >= 0; i--) { if (ind.boll.lo[i] == null) continue; ctx.lineTo(xs(i), y(ind.boll.lo[i])); }
      ctx.closePath(); ctx.fillStyle = 'rgba(255,198,92,0.06)'; ctx.fill();
      line(ctx, xs, ind.boll.up.map(function (v) { return v == null ? null : y(v); }), 'rgba(255,198,92,0.55)', 1);
      line(ctx, xs, ind.boll.lo.map(function (v) { return v == null ? null : y(v); }), 'rgba(255,198,92,0.55)', 1);
      line(ctx, xs, ind.boll.mid.map(function (v) { return v == null ? null : y(v); }), 'rgba(255,198,92,0.35)', 1);
    }

    // candles
    var cw = Math.max(1.5, step * 0.6);
    for (i = 0; i < c.length; i++) {
      var bull = c[i].c >= c[i].o;
      var col = bull ? '#26d982' : '#ff5c73';
      var x2 = xs(i);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x2, y(c[i].h)); ctx.lineTo(x2, y(c[i].l)); ctx.stroke();
      var yo = y(c[i].o), yc = y(c[i].c);
      ctx.fillRect(x2 - cw / 2, Math.min(yo, yc), cw, Math.max(1.5, Math.abs(yc - yo)));
    }

    // EMA ribbon
    if (state.show.ema) {
      line(ctx, xs, ind.ema9.map(function (v) { return v == null ? null : y(v); }), '#7f9bff', 1.5);
      line(ctx, xs, ind.ema21.map(function (v) { return v == null ? null : y(v); }), '#4d7cff', 1.5);
      line(ctx, xs, ind.ema50.map(function (v) { return v == null ? null : y(v); }), '#2f57c9', 1.5);
    }
    // VWAP
    if (state.show.vwap) {
      ctx.setLineDash([5, 4]);
      line(ctx, xs, ind.vwap.map(function (v) { return v == null ? null : y(v); }), '#c77dff', 1.5);
      ctx.setLineDash([]);
    }

    // last price marker + tag
    var last = c[c.length - 1];
    var ly = y(last.c);
    ctx.fillStyle = last.c >= last.o ? '#26d982' : '#ff5c73';
    ctx.fillRect(plotW, ly - 8, padR, 16);
    ctx.fillStyle = '#05231b'; ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.fillText(fmtPrice(last.c), plotW + 5, ly);
  }

  function drawRsi(ind) {
    var s = setup(elRsi), ctx = s.ctx, w = s.w, h = s.h;
    ctx.clearRect(0, 0, w, h);
    var padR = 54, plotW = w - padR;
    var c = state.candles, step = plotW / c.length;
    var xs = function (i) { return i * step + step / 2; };
    var y = function (v) { return 8 + (1 - v / 100) * (h - 16); };
    // zones 30/70
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, y(70), plotW, y(30) - y(70));
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([4, 4]);
    [30, 50, 70].forEach(function (lv) {
      ctx.beginPath(); ctx.moveTo(0, y(lv)); ctx.lineTo(plotW, y(lv)); ctx.stroke();
    });
    ctx.setLineDash([]);
    line(ctx, xs, ind.rsi.map(function (v) { return v == null ? null : y(v); }), '#00e0a4', 1.6);
    var lastR = lastVal(ind.rsi);
    ctx.fillStyle = 'rgba(154,167,194,0.8)'; ctx.font = '10px JetBrains Mono, monospace'; ctx.textBaseline = 'middle';
    ctx.fillText('70', plotW + 6, y(70)); ctx.fillText('30', plotW + 6, y(30));
    if (lastR != null) { ctx.fillStyle = '#00e0a4'; ctx.fillText(lastR.toFixed(0), plotW + 6, y(lastR)); }
  }

  function drawMacd(ind) {
    var s = setup(elMacd), ctx = s.ctx, w = s.w, h = s.h;
    ctx.clearRect(0, 0, w, h);
    var padR = 54, plotW = w - padR;
    var c = state.candles, step = plotW / c.length;
    var xs = function (i) { return i * step + step / 2; };
    var m = ind.macd;
    var mx = 0;
    for (var i = 0; i < c.length; i++) {
      [m.line[i], m.signal[i], m.hist[i]].forEach(function (v) { if (v != null) mx = Math.max(mx, Math.abs(v)); });
    }
    mx = mx || 1;
    var mid = h / 2;
    var y = function (v) { return mid - (v / mx) * (h / 2 - 8); };
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(plotW, mid); ctx.stroke();
    // histogram
    var bw = Math.max(1, step * 0.6);
    for (i = 0; i < c.length; i++) {
      if (m.hist[i] == null) continue;
      var hv = m.hist[i];
      ctx.fillStyle = hv >= 0 ? 'rgba(38,217,130,0.6)' : 'rgba(255,92,115,0.6)';
      var yv = y(hv);
      ctx.fillRect(xs(i) - bw / 2, Math.min(mid, yv), bw, Math.abs(yv - mid));
    }
    line(ctx, xs, m.line.map(function (v) { return v == null ? null : y(v); }), '#4d7cff', 1.4);
    line(ctx, xs, m.signal.map(function (v) { return v == null ? null : y(v); }), '#ffc65c', 1.4);
  }

  /* ============================================================
     Signal + metrics
     ============================================================ */
  function lastVal(arr) { for (var i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; }

  function updateSignal(ind) {
    var e9 = lastVal(ind.ema9), e21 = lastVal(ind.ema21), e50 = lastVal(ind.ema50);
    var r = lastVal(ind.rsi);
    var histArr = ind.macd.hist.filter(function (x) { return x != null; });
    var hlast = histArr[histArr.length - 1] || 0;
    var hprev = histArr[histArr.length - 2] || 0;

    var score = 50;
    if (e9 != null && e21 != null) score += e9 > e21 ? 12 : -12;
    if (e21 != null && e50 != null) score += e21 > e50 ? 8 : -8;
    if (r != null) score += r < 30 ? 15 : r > 70 ? -15 : (50 - r) * 0.35;
    score += hlast > 0 ? 12 : -12;
    score += hlast > hprev ? 6 : -6;
    score = Math.max(5, Math.min(95, Math.round(score)));

    var label = score >= 56 ? 'BUY' : score <= 44 ? 'SELL' : 'HOLD';
    var reasons = [];
    if (e9 != null && e21 != null) reasons.push(e9 > e21 ? 'EMA9 > EMA21' : 'EMA9 < EMA21');
    if (r != null) reasons.push(r < 30 ? 'RSI oversold' : r > 70 ? 'RSI overbought' : 'RSI neutral (' + r.toFixed(0) + ')');
    reasons.push(hlast > hprev ? 'MACD rising' : 'MACD falling');

    var badge = document.getElementById('sigBadge');
    badge.className = 'signalbox__badge signal ' + (label === 'BUY' ? 'signal--buy' : label === 'SELL' ? 'signal--sell' : 'signal--buy');
    if (label === 'HOLD') badge.classList.add('signal--hold');
    document.getElementById('sigLabel').textContent = label;
    document.getElementById('sigReason').textContent = reasons.slice(0, 2).join(' · ');
    document.getElementById('confBar').style.width = score + '%';
    document.getElementById('confVal').textContent = score + '%';

    state.posSign = label === 'BUY' ? 1 : label === 'SELL' ? -1 : 0;

    // metrics
    var last = state.candles[state.candles.length - 1];
    var first = state.candles[0];
    var chg = ((last.c - first.c) / first.c) * 100;
    document.getElementById('mLast').textContent = fmtPrice(last.c);
    var chgEl = document.getElementById('mChg');
    chgEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    chgEl.className = 'mono ' + (chg >= 0 ? 'up' : 'down');
    document.getElementById('mRsi').textContent = r != null ? r.toFixed(1) : '—';
    var macdEl = document.getElementById('mMacd');
    macdEl.textContent = hlast.toFixed(2);
    macdEl.className = 'mono ' + (hlast >= 0 ? 'up' : 'down');
    var posEl = document.getElementById('mPos');
    posEl.textContent = state.posSign > 0 ? 'Long' : state.posSign < 0 ? 'Short' : 'Flat';
    posEl.className = 'mono ' + (state.posSign > 0 ? 'up' : state.posSign < 0 ? 'down' : '');

    var pnlEl = document.getElementById('mPnl');
    pnlEl.textContent = (state.pnl >= 0 ? '+' : '') + state.pnl.toFixed(1) + '%';
    pnlEl.className = 'mono ' + (state.pnl >= 0 ? 'up' : 'down');

    // header quote
    document.getElementById('qPrice').textContent = fmtPrice(last.c);
    var qc = document.getElementById('qChange');
    qc.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    qc.className = 'quote__chg mono ' + (chg >= 0 ? 'up' : 'down');
  }

  function fmtPrice(v) {
    var d = SYMBOLS[state.symbol].dec;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  /* ============================================================
     Orchestration
     ============================================================ */
  function renderAll() {
    var ind = computeAll();
    drawMain(ind);
    if (state.show.rsi) { elRsi.parentElement.style.display = ''; drawRsi(ind); }
    else elRsi.parentElement.style.display = 'none';
    if (state.show.macd) { elMacd.parentElement.style.display = ''; drawMacd(ind); }
    else elMacd.parentElement.style.display = 'none';
    updateSignal(ind);
  }

  /* ============================================================
     Live data layer — Binance public API with sim fallback
     ============================================================ */
  var feedBadge = document.getElementById('feedBadge');
  var ws = null;            // active WebSocket
  var simTimer = null;      // simulation interval
  var loadToken = 0;        // guards against out-of-order async loads
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setFeed(kind) {
    if (kind === 'live') { feedBadge.className = 'feed feed--live'; feedBadge.textContent = 'LIVE'; }
    else if (kind === 'sim') { feedBadge.className = 'feed feed--sim'; feedBadge.textContent = 'SIM'; }
    else { feedBadge.className = 'feed feed--sim'; feedBadge.textContent = 'CONNECTING…'; }
  }

  function teardown() {
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; }
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
  }

  function fetchKlines(pair, interval) {
    var url = 'https://api.binance.com/api/v3/klines?symbol=' + pair +
              '&interval=' + interval + '&limit=' + N;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (rows) {
      return rows.map(function (k) {
        return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] };
      });
    });
  }

  function openStream(pair, interval) {
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/' +
        pair.toLowerCase() + '@kline_' + interval);
    } catch (e) { return; }
    ws.onmessage = function (msg) {
      var d; try { d = JSON.parse(msg.data); } catch (e) { return; }
      var k = d.k; if (!k) return;
      var c = state.candles;
      var last = c[c.length - 1];
      var bar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
      if (last && k.t === last.t) {
        c[c.length - 1] = bar;                  // update forming candle
      } else if (!last || k.t > last.t) {
        c.push(bar); if (c.length > N) c.shift(); // new candle rolled in
      }
      var ret = (bar.c - bar.o) / bar.o * 100;
      state.pnl = state.pnl * 0.98 + ret * state.posSign * 0.15;
      throttledRender();
    };
    ws.onclose = function () { /* keep last frame; badge stays LIVE */ };
  }

  var rafPending = false;
  function throttledRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; renderAll(); });
  }

  function startSim() {
    setFeed('sim');
    if (reduce) return;
    simTimer = setInterval(function () {
      var c = state.candles, prev = c[c.length - 1], cfg = SYMBOLS[state.symbol];
      var v = cfg.vol * TF_DRIFT[state.tf];
      var open = prev.c;
      var close = Math.max(open + (Math.random() - 0.49) * prev.c * v * 2, open * 0.85);
      var hi = Math.max(open, close) + Math.random() * prev.c * v * 0.9;
      var lo = Math.min(open, close) - Math.random() * prev.c * v * 0.9;
      c.push({ t: (prev.t || 0) + 1, o: open, h: hi, l: lo, c: close, v: 1 + Math.random() * 3 });
      c.shift();
      state.pnl += (close - open) / open * 100 * state.posSign;
      renderAll();
    }, 1600);
  }

  function loadSymbol(sym, tf) {
    teardown();
    state.symbol = sym; state.tf = tf; state.pnl = 0;
    var cfg = SYMBOLS[sym];
    document.getElementById('qSym').textContent = cfg.label;
    document.getElementById('tfLabel').textContent = tf;
    setFeed('connecting');

    var token = ++loadToken;

    if (cfg.binance) {
      var interval = TF_INTERVAL[tf];
      fetchKlines(cfg.binance, interval).then(function (candles) {
        if (token !== loadToken) return;            // superseded by newer click
        state.candles = candles;
        setFeed('live');
        renderAll();
        if (!reduce) openStream(cfg.binance, interval);
      }).catch(function () {
        if (token !== loadToken) return;
        state.candles = genSeries(sym, tf);         // graceful fallback
        renderAll();
        startSim();
      });
    } else {
      state.candles = genSeries(sym, tf);
      renderAll();
      startSim();
    }
  }

  /* ---------- controls ---------- */
  document.getElementById('marketTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.mtab'); if (!b) return;
    document.querySelectorAll('.mtab').forEach(function (x) { x.classList.remove('is-active'); });
    b.classList.add('is-active');
    loadSymbol(b.dataset.symbol, state.tf);
  });
  document.querySelector('.tf').addEventListener('click', function (e) {
    var b = e.target.closest('.tf__btn'); if (!b) return;
    document.querySelectorAll('.tf__btn').forEach(function (x) { x.classList.remove('is-active'); });
    b.classList.add('is-active');
    loadSymbol(state.symbol, b.dataset.tf);
  });
  document.getElementById('toggles').addEventListener('change', function (e) {
    var ind = e.target.dataset.ind; if (!ind) return;
    state.show[ind] = e.target.checked;
    renderAll();
  });

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(renderAll, 120); }, { passive: true });

  /* ---------- go ---------- */
  loadSymbol('BTC', '1H');
})();
