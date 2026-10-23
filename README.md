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

> **Login works with or without a backend.** If the `/api` backend is deployed, auth uses
> Neon + email codes + a session cookie. If it isn't (plain static deploy, or opening the
> files directly), the **same** signup → 6-digit code → verify → 7-day trial → login flow
> runs fully in the browser (stored in `localStorage`). No configuration needed to try it.
> The dashboard requires login; the **"Watch the live demo"** button opens it as a public
> guest via `app.html?demo=1`.

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

The dashboard streams **real** market data and computes RSI, MACD, Bollinger Bands, EMA,
and VWAP on live candles:

- **Crypto** (BTC, ETH, SOL) — Binance public REST + WebSocket (live, no key needed).
- **Metals** (gold XAU/USD, silver XAG/USD) and **stocks** (AAPL, NVDA) — Twelve Data via
  the `/api/market` serverless proxy (set `TWELVEDATA_API_KEY`), polled every 20–30s.

- **Traditional markets** (Macro tab) — S&P 500, Nasdaq, VIX, US dollar, 10Y and gold/silver. Intraday via
  Twelve Data when `TWELVEDATA_API_KEY` is set; otherwise each tile falls back to end-of-day FRED data
  (SP500, NASDAQCOM, VIXCLS, DTWEXBGS, DGS10) and the metals feed, so the section works with no key.
  The Macro tab auto-refreshes every 5 minutes while open.
- **Early Movers** — DexScreener trending, boosted and newly listed tokens scored on 1h momentum,
  buy/sell pressure (1h transactions), volume surge vs the 24h pace, turnover and pair age, with
  sorting and an automatic re-scan every 5 minutes while the tab is open.
- **💎 Early Gems** (mode inside Early Movers) — brand-new small caps (under ~2 weeks old, $30K–$10M cap)
  from DexScreener and GeckoTerminal new pools, ranked on accumulation footprints (steady 5m/1h/6h
  buying, buyers > sellers, rising activity & volume), liquidity depth and socials, and penalised
  if already pumped. GoPlus holder concentration and LP-lock data adjust the score; concentrated or
  unlocked tokens are marked caution. A ranking of early setups — not a prediction.
- **🎯 Signal Lab** (Terminal) — grades all 19 indicator votes on the loaded chart (500 candles) against
  what price did over the next 5 candles, learns weights on the older 60% and tests on the newer 40%
  out-of-sample, versus the fixed formula and a same-mix coin-flip baseline. The adaptive model only
  gets a 50% say in the verdict when it beats the fixed formula out-of-sample.
- **💧 Liquidity & leverage** (Macro tab) — Fed net liquidity (WALCL − TGA − reverse repo), M2, 10Y
  real yield (FRED), total stablecoin supply (DeFiLlama), BTC funding & open interest (Binance, OKX
  fallback). Liquidity drains and overheated leverage add up to 25 points to the risk score.
- **📊 Scanner track record** (Early Movers) — each top-10 pick is followed for 24h on the device;
  shows % up and median return at 1h/4h/24h. Tokens strengthening across consecutive scans get a
  "Persistent" bonus; ones fading since spotted are penalised.
- **📊 Stocks tab** — S&P 500, Nasdaq 100, Dow and Russell 2000, big tech (AAPL, MSFT, NVDA, AMZN,
  GOOGL, META, TSLA) and crypto stocks (COIN, MSTR, MARA, RIOT, HOOD, IBIT) via the `/api/stocks`
  proxy (Yahoo Finance → Stooq → Twelve Data, no key needed), each with trend, RSI and the same
  composite signal as the Terminal. Tap a stock to chart it in the Terminal, where you can also search
  any ticker.
- **🔗 Crypto ↔ stocks relationship** (Stocks tab) — BTC/ETH correlation with the Nasdaq and S&P 500
  (30d/90d, rolling 60d chart), BTC's beta to the Nasdaq, what BTC did on big Nasdaq up/down days,
  next-day lead/lag, and which crypto stocks amplify Bitcoin. The 90-day BTC–Nasdaq correlation also
  scales how much equity stress counts in the Macro risk score.
- **Recession & crisis early-warning** (Macro tab) — FRED (St. Louis Fed) via the `/api/fred`
  proxy — works with no key (public FRED CSV); `FRED_API_KEY` optional: 10Y−3M / 10Y−2Y yield curves, high-yield credit spreads,
  Sahm rule, initial jobless claims, Chicago Fed NFCI, St. Louis Fed stress index, VIX, housing
  permits, consumer sentiment, and a 12-month recession probability from the NY Fed
  yield-curve model. Combined into a 0–100 early-warning score that also feeds the global
  risk score.
- **Gold, silver & financial crashes** (Macro tab) — daily gold & silver via `/api/metals`
  (no key: Stooq, CoinGecko gold/silver tokens; Twelve Data if `TWELVEDATA_API_KEY` is set) vs
  the S&P 500 (FRED): gold/silver "fear" ratio, 1-year indexed performance, 60-day
  correlations, a crash-pattern detector (flight to safety, margin-call squeeze, ratio spikes)
  and how both metals behaved in past crashes (2000, 2008, 2011, 2020, 2022).

Any symbol falls back to simulation if its feed is unavailable — shown by a **LIVE / SIM**
badge next to the pair.

**Search any market:** the dashboard has a search box that queries Binance's live symbol
list, so you can find and chart **any** crypto pair (BTC, ETH, SOL, DOGE, SHIB, and hundreds
more) with the full indicator suite — not just the preset tabs.

> **Disclaimer:** Figures, testimonials, and performance stats on the landing page are
> illustrative. This is not investment advice; trading involves substantial risk of loss.
