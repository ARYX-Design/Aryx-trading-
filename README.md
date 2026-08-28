# Aryx — Trading Bot Landing Page

A professional, responsive landing page for **Aryx**, an automated trading bot for
**crypto, stocks, and precious metals** with institutional-grade indicators.

> **Live dashboard:** `app.html` streams **real market data** for crypto (BTC, ETH, SOL)
> and gold (PAXG) from Binance's free public REST + WebSocket API, computing RSI, MACD,
> Bollinger Bands, EMA, and VWAP on live candles. Stocks are simulated, and any symbol
> falls back to simulation automatically if the live feed is blocked — shown by a
> **LIVE / SIM** badge.

## Highlights

- **Animated live-chart hero** — a canvas candlestick chart with a rotating buy/sell
  signal ticker and live price/percent updates.
- **Multi-market positioning** — dedicated sections for crypto, stocks/ETFs, and metals.
- **Indicators showcase** — trend, momentum, volatility, and volume indicators
  (RSI, MACD, Bollinger, VWAP, Ichimoku, ATR sizing, and more).
- **Full marketing funnel** — how-it-works, features, pricing, testimonials, FAQ, and CTA.
- **Polished dark fintech design** — gradient accents, glassmorphism, count-up stats,
  and scroll-reveal animations.
- **Fully responsive** with a mobile menu, and respects `prefers-reduced-motion`.

## Structure

```
index.html        Page markup
css/styles.css    Design system + components
js/main.js        Chart animation, count-up, reveals, nav
```

## Run locally

No build step — it's a static site. Open `index.html` directly, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

Vanilla HTML, CSS, and JavaScript. No dependencies or frameworks — fast to load
and easy to deploy to any static host (GitHub Pages, Netlify, Vercel, etc.).

> **Disclaimer:** This is a marketing landing page. All figures, testimonials, and
> performance stats shown are illustrative placeholders. Trading involves substantial
> risk of loss.
