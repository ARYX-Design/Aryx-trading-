/* GET /api/metals
   ~1 year of DAILY gold & silver prices (USD / troy oz) for the Macro tab's
   "Gold, silver & financial crashes" section.

   NO KEY NEEDED. Sources, tried in order per metal:
     1. Twelve Data XAU/USD, XAG/USD   (only if TWELVEDATA_API_KEY is set)
     2. Stooq public daily CSV         (xauusd / xagusd)
     3. CoinGecko gold/silver-backed tokens (PAX Gold, Kinesis Silver) — track spot closely

   Responds { gold:{latest,date,hist,source}, silver:{...} } with hist as
   oldest-first [[YYYY-MM-DD, close], ...]. Cached at the edge for 30 min. */
const { json } = require('./_lib/util');

var HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AryxMacro/1.0)', 'Accept': 'text/csv,application/json,*/*' };
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var DAYS = 400;
var METALS = {
  gold:   { td: 'XAU/USD', stooq: 'xauusd', cg: ['pax-gold', 'tether-gold'], min: 200, max: 20000 },
  silver: { td: 'XAG/USD', stooq: 'xagusd', cg: ['kinesis-silver'],          min: 3,   max: 500 }
};

function ymd(d) { return new Date(d).toISOString().slice(0, 10); }

function clean(rows, cfg) {
  var seen = {}, out = [];
  rows.forEach(function (r) {
    var d = r && r[0], v = r && +r[1];
    if (!DATE_RE.test(d) || !isFinite(v) || v < cfg.min || v > cfg.max) return;  // sanity-check the price range
    seen[d] = v;
  });
  Object.keys(seen).sort().forEach(function (d) { out.push([d, seen[d]]); });
  var from = ymd(Date.now() - DAYS * 86400000);
  out = out.filter(function (p) { return p[0] >= from; });
  return out.length >= 30 ? out : null;
}

async function fromTwelve(cfg, key) {
  var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(cfg.td) +
    '&interval=1day&outputsize=300&format=JSON&apikey=' + encodeURIComponent(key);
  var r = await fetch(url, { headers: HEADERS });
  var d = await r.json();
  if (!d || !Array.isArray(d.values)) throw new Error('td_no_data');
  return d.values.map(function (v) { return [String(v.datetime).slice(0, 10), v.close]; });
}

async function fromStooq(cfg) {
  var d1 = ymd(Date.now() - DAYS * 86400000).replace(/-/g, ''), d2 = ymd(Date.now()).replace(/-/g, '');
  var r = await fetch('https://stooq.com/q/d/l/?s=' + cfg.stooq + '&d1=' + d1 + '&d2=' + d2 + '&i=d', { headers: HEADERS });
  if (!r.ok) throw new Error('stooq_' + r.status);
  var text = await r.text();
  // Date,Open,High,Low,Close,Volume
  return text.split(/\r?\n/).map(function (line) { var c = line.split(','); return [String(c[0] || '').trim(), c[4]]; });
}

async function fromCoinGecko(cfg) {
  for (var i = 0; i < cfg.cg.length; i++) {
    try {
      var r = await fetch('https://api.coingecko.com/api/v3/coins/' + cfg.cg[i] +
        '/market_chart?vs_currency=usd&days=365&interval=daily', { headers: HEADERS });
      if (!r.ok) continue;
      var d = await r.json();
      if (d && Array.isArray(d.prices) && d.prices.length) return d.prices.map(function (p) { return [ymd(p[0]), p[1]]; });
    } catch (e) { /* try next id */ }
  }
  throw new Error('cg_no_data');
}

async function loadMetal(name, key) {
  var cfg = METALS[name];
  var chain = [];
  if (key) chain.push(['twelvedata', function () { return fromTwelve(cfg, key); }]);
  chain.push(['stooq', function () { return fromStooq(cfg); }]);
  chain.push(['coingecko', function () { return fromCoinGecko(cfg); }]);
  for (var i = 0; i < chain.length; i++) {
    try {
      var hist = clean(await chain[i][1](), cfg);
      if (hist) { var last = hist[hist.length - 1]; return { latest: last[1], date: last[0], hist: hist, source: chain[i][0] }; }
    } catch (e) { console.error('[aryx] metals', name, chain[i][0], e && e.message); }
  }
  return null;
}

module.exports = async function handler(req, res) {
  var key = process.env.TWELVEDATA_API_KEY;
  var results = await Promise.all([loadMetal('gold', key), loadMetal('silver', key)]);
  var out = {};
  if (results[0]) out.gold = results[0];
  if (results[1]) out.silver = results[1];
  if (out.gold || out.silver) res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return json(res, 200, out);
};
