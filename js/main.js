/* ============================================================
   Aryx — Landing page interactions
   - animated candlestick hero chart with live ticker
   - count-up stats on scroll
   - scroll reveal
   - sticky nav state + mobile menu
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Sticky nav shadow ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const toggle = document.getElementById('navToggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('.nav__links a').forEach((a) =>
    a.addEventListener('click', () => nav.classList.remove('is-open'))
  );

  /* ---------- Scroll reveal ---------- */
  const revealSelectors =
    '.market, .indicator, .feature, .step, .plan, .quote, .stat, .section__head, .cta__inner';
  document.querySelectorAll(revealSelectors).forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = (i % 4) * 60 + 'ms';
  });
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---------- Count-up stats ---------- */
  const fmt = (n, opts) => {
    const { compact, prefix = '', suffix = '', decimals = 0 } = opts;
    let out;
    if (compact) {
      if (n >= 1e9) out = (n / 1e9).toFixed(1) + 'B';
      else if (n >= 1e6) out = (n / 1e6).toFixed(1) + 'M';
      else if (n >= 1e3) out = (n / 1e3).toFixed(1) + 'K';
      else out = Math.round(n).toString();
    } else {
      out = n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    return prefix + out + suffix;
  };

  const animateStat = (el) => {
    const target = parseFloat(el.dataset.count);
    const opts = {
      compact: el.dataset.compact === '1',
      prefix: el.dataset.prefix || '',
      suffix: el.dataset.suffix || '',
      decimals: parseInt(el.dataset.decimals || '0', 10),
    };
    const numEl = el.querySelector('.stat__num');
    const dur = 1600;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      numEl.textContent = fmt(target * eased, opts);
      if (p < 1) requestAnimationFrame(tick);
      else numEl.textContent = fmt(target, opts);
    };
    requestAnimationFrame(tick);
  };

  const statIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animateStat(e.target);
          statIO.unobserve(e.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('.stat').forEach((el) => statIO.observe(el));

  /* ============================================================
     Hero candlestick chart
     ============================================================ */
  const canvas = document.getElementById('heroChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const priceValEl = document.getElementById('priceVal');
  const priceChgEl = document.getElementById('priceChg');
  const signalBadge = document.getElementById('signalBadge');
  const signalText = document.getElementById('signalText');

  const CANDLES = 46;
  let candles = [];
  let basePrice = 63500;

  // seed a plausible-looking series
  const seed = () => {
    candles = [];
    let price = basePrice;
    for (let i = 0; i < CANDLES; i++) {
      const drift = (Math.random() - 0.46) * price * 0.012;
      const open = price;
      const close = price + drift;
      const high = Math.max(open, close) + Math.random() * price * 0.006;
      const low = Math.min(open, close) - Math.random() * price * 0.006;
      candles.push({ open, high, low, close });
      price = close;
    }
  };
  seed();

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight || 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight || 220;
    ctx.clearRect(0, 0, w, h);

    // price bounds
    let min = Infinity, max = -Infinity;
    candles.forEach((c) => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    });
    const pad = (max - min) * 0.12;
    min -= pad; max += pad;
    const range = max - min || 1;
    const padX = 6;
    const usableW = w - padX * 2;
    const y = (p) => h - ((p - min) / range) * (h - 20) - 10;

    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const gy = 10 + (g / 4) * (h - 20);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // area under close (trend line)
    const step = usableW / CANDLES;
    ctx.beginPath();
    candles.forEach((c, i) => {
      const cx = padX + i * step + step / 2;
      const cy = y(c.close);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    const last = candles[candles.length - 1];
    const up = last.close >= candles[0].close;
    const lineColor = up ? '#26d982' : '#ff5c73';
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? 'rgba(38,217,130,0.22)' : 'rgba(255,92,115,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.lineTo(padX + CANDLES * step, h);
    ctx.lineTo(padX + step / 2, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // candles
    const cw = Math.max(2, step * 0.55);
    candles.forEach((c, i) => {
      const cx = padX + i * step + step / 2;
      const bull = c.close >= c.open;
      const col = bull ? '#26d982' : '#ff5c73';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      // wick
      ctx.beginPath();
      ctx.moveTo(cx, y(c.high));
      ctx.lineTo(cx, y(c.low));
      ctx.lineWidth = 1;
      ctx.stroke();
      // body
      const yo = y(c.open), yc = y(c.close);
      const top = Math.min(yo, yc);
      const bh = Math.max(2, Math.abs(yc - yo));
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - cw / 2, top, cw, bh);
      ctx.globalAlpha = 1;
    });

    // last price marker
    const lx = padX + (CANDLES - 1) * step + step / 2;
    const ly = y(last.close);
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.strokeStyle = lineColor;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const signals = [
    { cls: 'signal--buy', txt: 'BUY signal · RSI + MACD crossover' },
    { cls: 'signal--buy', txt: 'BUY signal · EMA ribbon aligned' },
    { cls: 'signal--sell', txt: 'SELL signal · Bollinger upper reject' },
    { cls: 'signal--buy', txt: 'BUY signal · VWAP reclaim' },
    { cls: 'signal--sell', txt: 'SELL signal · Stochastic overbought' },
  ];
  let sigIndex = 0;

  const updateHUD = () => {
    const last = candles[candles.length - 1];
    const first = candles[0];
    const chg = ((last.close - first.close) / first.close) * 100;
    priceValEl.textContent =
      '$' + last.close.toLocaleString('en-US', { maximumFractionDigits: 0 });
    priceChgEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    priceChgEl.className = 'price__chg ' + (chg >= 0 ? 'up' : 'down');
  };

  // live tick: shift a new candle in
  const tick = () => {
    const prev = candles[candles.length - 1];
    const drift = (Math.random() - 0.48) * prev.close * 0.014;
    const open = prev.close;
    const close = Math.max(open + drift, open * 0.9);
    const high = Math.max(open, close) + Math.random() * prev.close * 0.006;
    const low = Math.min(open, close) - Math.random() * prev.close * 0.006;
    candles.push({ open, high, low, close });
    candles.shift();
    draw();
    updateHUD();
  };

  const rotateSignal = () => {
    sigIndex = (sigIndex + 1) % signals.length;
    const s = signals[sigIndex];
    signalBadge.className = 'signal ' + s.cls;
    signalText.textContent = s.txt;
  };

  resize();
  draw();
  updateHUD();
  window.addEventListener('resize', () => { resize(); draw(); }, { passive: true });

  // respect reduced motion
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    setInterval(tick, 1500);
    setInterval(rotateSignal, 4500);
  }
})();
