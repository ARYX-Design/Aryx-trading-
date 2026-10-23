/* GET /api/stocks?symbols=SPY,AAPL,^GSPC,BTC-USD&interval=1d&range=2y
   OHLCV candles for stocks, ETFs and indices (Stocks tab, crypto↔stocks
   relationship, and stock charts in the Terminal).

   NO KEY NEEDED. Sources, tried in order per symbol:
     1. Yahoo Finance chart API (server-side, so no browser CORS issues)
     2. Stooq public daily CSV            (daily/weekly/monthly only)
     3. Twelve Data                       (only if TWELVEDATA_API_KEY is set)

   Responds { series: { SYM: { candles:[[t,o,h,l,c,v],...], source } } }
   with t in ms, oldest-first. Daily data is cached at the edge for 10 min,
   intraday for 1 min. */
const { json } = require('./_lib/util');

var HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AryxStocks/1.0)', 'Accept': 'application/json,text/csv,*/*' };
var SYM_RE = /^[A-Z0-9^=.\-]{1,12}$/;
var MAX_SYMBOLS = 20, MAX_CANDLES = 520;
var INTERVALS = { '15m': 1, '60m': 1, '1d': 1, '1wk': 1, '1mo': 1 };
var RANGES = { '5d': 1, '1mo': 1, '3mo': 1, '6mo': 1, '30d': 1, '60d': 1, '180d': 1, '1y': 1, '2y': 1, '5y': 1, '10y': 1, 'max': 1, '720d': 1 };
var RANGE_DAYS = { '5d': 5, '1mo': 31, '3mo': 92, '6mo': 183, '30d': 30, '60d': 60, '180d': 180, '1y': 366, '2y': 731, '5y': 1827, '10y': 3653, 'max': 20000, '720d': 720 };
// Stooq uses its own tickers for indices / futures; US stocks & ETFs are "<sym>.us"
var STOOQ_MAP = { '^GSPC': '^spx', '^NDX': '^ndx', '^DJI': '^dji', '^IXIC': '^ndq', '^RUT': '^rut', '^VIX': '^vix', 'SI=F': 'si.f', 'GC=F': 'gc.f', 'BTC-USD': 'btcusd', 'ETH-USD': 'ethusd' };
var TD_MAP = { '^GSPC': 'SPX', '^NDX': 'NDX', '^DJI': 'DJI', '^IXIC': 'IXIC', '^VIX': 'VIX', 'BTC-USD': 'BTC/USD', 'ETH-USD': 'ETH/USD' };

function r6(v) { return Math.round(v * 1e6) / 1e6; }

function tidy(rows) {
  var seen = {};
  rows.forEach(function (c) {
    if (!c || !isFinite(c[0]) || !isFinite(c[4]) || c[4] <= 0) return;
    seen[c[0]] = [c[0], r6(isFinite(c[1]) ? c[1] : c[4]), r6(isFinite(c[2]) ? c[2] : c[4]), r6(isFinite(c[3]) ? c[3] : c[4]), r6(c[4]), Math.round(c[5] || 0)];
  });
  var out = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return seen[t]; });
  return out.length >= 5 ? out.slice(-MAX_CANDLES) : null;
}

async function fromYahoo(sym, interval, range) {
  var hosts = ['query1', 'query2'];
  for (var i = 0; i < hosts.length; i++) {
    try {
      var url = 'https://' + hosts[i] + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) +
        '?interval=' + interval + '&range=' + range + '&includePrePost=false';
      var r = await fetch(url, { headers: HEADERS });
      if (!r.ok) continue;
      var j = await r.json();
      var res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp) continue;
      var q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
      var rows = res.timestamp.map(function (t, k) {
        return [t * 1000, +q.open[k], +q.high[k], +q.low[k], q.close[k] == null ? NaN : +q.close[k], +q.volume[k] || 0];
      });
      var out = tidy(rows);
      if (out) return out;
    } catch (e) { /* try next host */ }
  }
  throw new Error('yahoo_no_data');
}

async function fromStooq(sym, interval, range) {
  var iv = { '1d': 'd', '1wk': 'w', '1mo': 'm' }[interval];
  if (!iv) throw new Error('stooq_intraday');
  var code = STOOQ_MAP[sym] || (/^[A-Z.\-]+$/.test(sym) ? sym.toLowerCase().replace('.', '-') + '.us' : null);
  if (!code) throw new Error('stooq_unmapped');
  var days = RANGE_DAYS[range] || 731;
  var ymd = function (ms) { return new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); };
  var url = 'https://stooq.com/q/d/l/?s=' + encodeURIComponent(code) + '&d1=' + ymd(Date.now() - days * 86400000) + '&d2=' + ymd(Date.now()) + '&i=' + iv;
  var r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('stooq_' + r.status);
  var text = await r.text();
  // Date,Open,High,Low,Close,Volume
  var rows = text.split(/\r?\n/).slice(1).map(function (line) {
    var c = line.split(',');
    var t = Date.parse(String(c[0] || '').trim() + 'T21:00:00Z');   // ~US close
    return [t, +c[1], +c[2], +c[3], +c[4], +c[5] || 0];
  });
  var out = tidy(rows);
  if (!out) throw new Error('stooq_empty');
  return out;
}

async function fromTwelve(sym, interval, key) {
  var iv = { '15m': '15min', '60m': '1h', '1d': '1day', '1wk': '1week', '1mo': '1month' }[interval];
  var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(TD_MAP[sym] || sym) +
    '&interval=' + iv + '&outputsize=500&format=JSON&apikey=' + encodeURIComponent(key);
  var r = await fetch(url, { headers: HEADERS });
  var d = await r.json();
  if (!d || !Array.isArray(d.values)) throw new Error('td_no_data');
  var out = tidy(d.values.map(function (v) {
    return [Date.parse(String(v.datetime).replace(' ', 'T') + (v.datetime.length > 10 ? 'Z' : 'T21:00:00Z')), +v.open, +v.high, +v.low, +v.close, +v.volume || 0];
  }));
  if (!out) throw new Error('td_empty');
  return out;
}

async function loadSymbol(sym, interval, range, key) {
  var chain = [['yahoo', function () { return fromYahoo(sym, interval, range); }],
               ['stooq', function () { return fromStooq(sym, interval, range); }]];
  if (key) chain.push(['twelvedata', function () { return fromTwelve(sym, interval, key); }]);
  for (var i = 0; i < chain.length; i++) {
    try { return { candles: await chain[i][1](), source: chain[i][0] }; }
    catch (e) { console.error('[aryx] stocks', sym, chain[i][0], e && e.message); }
  }
  return null;
}

module.exports = async function handler(req, res) {
  var q = req.query || {};
  var interval = INTERVALS[q.interval] ? q.interval : '1d';
  var range = RANGES[q.range] ? q.range : '2y';
  var syms = String(q.symbols || q.symbol || '').split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(function (s, i, a) { return SYM_RE.test(s) && a.indexOf(s) === i; })
    .slice(0, MAX_SYMBOLS);
  if (!syms.length) return json(res, 400, { error: 'no_symbols' });

  var key = process.env.TWELVEDATA_API_KEY, out = {};
  await Promise.all(syms.map(function (s) {
    return loadSymbol(s, interval, range, key).then(function (d) { if (d) out[s] = d; });
  }));

  if (Object.keys(out).length) {
    var daily = interval === '1d' || interval === '1wk' || interval === '1mo';
    res.setHeader('Cache-Control', daily ? 's-maxage=600, stale-while-revalidate=1800' : 's-maxage=60, stale-while-revalidate=120');
  }
  return json(res, 200, { series: out });
};
