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

## Accounts, email verification & 7-day trial

Real auth runs on **Vercel serverless functions + Neon Postgres**:

- **Sign up** with name / email / password → account created, 7-day trial window set.
- A **6-digit code** is generated and emailed (via Resend). Enter it to **verify** and
  activate the trial.
- **Login** issues a signed, HttpOnly session cookie.
- The **dashboard** checks the session and shows a live **trial countdown**; when the
  trial ends it's gated behind an upgrade overlay.
- Passwords are hashed with scrypt; codes are stored hashed and expire in 15 minutes.

> **Works without a backend too:** on a plain static host (no `/api`), the dashboard
> runs as a public **demo** and the charts still stream live data — auth is simply skipped.

## Structure

```
index.html          Landing page + auth modal
app.html            Trading dashboard (live chart + indicators)
css/                styles.css (site) · app.css (dashboard)
js/                 main.js (landing) · auth.js (auth client) · app.js (dashboard)
api/                Vercel serverless functions
  init.js           One-time DB setup
  auth/             signup · verify · resend · login · logout · me
  _lib/             db (Neon) · util (crypto/session) · email (Resend)
db/schema.sql       Database schema
vercel.json         Static hosting + security/cache headers
```

## Deploy to Vercel + Neon

1. **Create a Neon database** at [neon.tech](https://neon.tech) and copy the **pooled**
   connection string.
2. **Import this repo** at [vercel.com/new](https://vercel.com/new) (Framework preset:
   *Other*; no build command — static + serverless is auto-detected).
3. **Set env vars** in Vercel → Settings → Environment Variables (see `.env.example`):
   `DATABASE_URL`, `SESSION_SECRET`, `INIT_SECRET`, and optionally `RESEND_API_KEY` +
   `EMAIL_FROM`.
4. **Deploy**, then initialize the database once:
   `https://YOUR-APP.vercel.app/api/init?secret=YOUR_INIT_SECRET`
   (or run `db/schema.sql` in the Neon SQL editor).
5. Open the site, click **Start free trial**, and complete signup → verification.

**Email:** with `RESEND_API_KEY` + `EMAIL_FROM` set, codes are emailed. Without them, the
app runs in **DEV mode** and shows the code in the verification dialog so you can test
end-to-end before wiring up a domain.

## Run locally

Static preview (charts + demo, no auth):

```bash
python3 -m http.server 8000   # http://localhost:8000
```

Full stack (auth + trial) with the Vercel CLI:

```bash
npm install
npx vercel dev                # provide DATABASE_URL etc. via a .env file
```

## Live market data

The dashboard streams **real** prices for crypto (BTC, ETH, SOL) and gold (PAXG) from
Binance's public REST + WebSocket API, computing RSI, MACD, Bollinger Bands, EMA, and
VWAP on live candles. Stocks are simulated, and any symbol falls back to simulation if
the live feed is blocked — shown by a **LIVE / SIM** badge.

> **Disclaimer:** Figures, testimonials, and performance stats on the landing page are
> illustrative. This is not investment advice; trading involves substantial risk of loss.
