/* GET /api/fred?series=T10Y3M,BAMLH0A0HYM2,...
   Proxies economic series from FRED (Federal Reserve Bank of St. Louis,
   https://fred.stlouisfed.org). Used by the Macro tab's crisis / recession
   early-warning panel.

   NO KEY NEEDED: by default it reads FRED's public CSV download
   (fredgraph.csv). If FRED_API_KEY is set, the official JSON API is used
   first (falling back to CSV on any error).

   Responds { series: { ID: { latest, date, hist:[[date,value],...] } } }
   (hist is oldest-first, ~3 years, thinned to <=160 points). FRED data
   updates at most daily, so responses are cached at the edge for an hour. */
const { json } = require('./_lib/util');

var ALLOWED = {
  T10Y3M: 1,        // 10-year minus 3-month Treasury spread (NY Fed recession model input)
  T10Y2Y: 1,        // 10-year minus 2-year Treasury spread
  BAMLH0A0HYM2: 1,  // ICE BofA US High-Yield option-adjusted spread (credit stress)
  SAHMREALTIME: 1,  // Sahm-rule recession indicator (real-time)
  ICSA: 1,          // Initial jobless claims (weekly)
  NFCI: 1,          // Chicago Fed National Financial Conditions Index
  STLFSI4: 1,       // St. Louis Fed Financial Stress Index
  VIXCLS: 1,        // CBOE VIX close
  PERMIT: 1,        // New private housing permits (leading indicator)
  UMCSENT: 1,       // University of Michigan consumer sentiment
  RECPROUSM156N: 1  // Smoothed US recession probabilities (Chauvet-Piger)
};
var MAX_SERIES = 12, MAX_POINTS = 160;
var HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AryxMacro/1.0)', 'Accept': 'text/csv,application/json,*/*' };
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Official API (needs FRED_API_KEY)
async function fromApi(id, key, start) {
  var url = 'https://api.stlouisfed.org/fred/series/observations' +
    '?series_id=' + id + '&api_key=' + encodeURIComponent(key) +
    '&file_type=json&sort_order=asc&observation_start=' + start;
  var r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('fred_api_' + r.status);
  var data = await r.json();
  return (data && data.observations || []).map(function (o) { return [o && o.date, o && o.value]; });
}

// Public CSV download (no key): "observation_date,SERIES\n2024-01-02,1.23\n..."
async function fromCsv(id, start) {
  var url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + start;
  var r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('fred_csv_' + r.status);
  var text = await r.text();
  return text.split(/\r?\n/).map(function (line) {
    var c = line.split(',');
    return [String(c[0] || '').trim(), String(c[1] || '').trim()];
  });
}

async function fetchSeries(id, key) {
  var start = isoDaysAgo(3 * 365 + 30), raw = null;
  if (key) { try { raw = await fromApi(id, key, start); } catch (e) { raw = null; } }
  if (!raw || !raw.length) raw = await fromCsv(id, start);
  var obs = raw
    .filter(function (o) { return DATE_RE.test(o[0]) && o[1] !== '' && o[1] !== '.' && isFinite(+o[1]); })
    .map(function (o) { return [o[0], +o[1]]; });
  if (!obs.length) return null;
  // thin long daily series, always keeping the most recent observation
  var hist = obs;
  if (obs.length > MAX_POINTS) {
    var step = obs.length / MAX_POINTS;
    hist = [];
    for (var i = 0; i < MAX_POINTS - 1; i++) hist.push(obs[Math.floor(i * step)]);
    hist.push(obs[obs.length - 1]);
  }
  var last = obs[obs.length - 1];
  return { latest: last[1], date: last[0], hist: hist };
}

module.exports = async function handler(req, res) {
  var q = req.query || {};
  var key = process.env.FRED_API_KEY;
  var ids = String(q.series || '').split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(function (s, i, a) { return ALLOWED[s] && a.indexOf(s) === i; })
    .slice(0, MAX_SERIES);

  if (!ids.length) return json(res, 400, { error: 'unsupported_series' });

  var out = {};
  await Promise.all(ids.map(function (id) {
    return fetchSeries(id, key)
      .then(function (s) { if (s) out[id] = s; })
      .catch(function (e) { console.error('[aryx] fred', id, e && e.message); });
  }));

  if (Object.keys(out).length) res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return json(res, 200, { series: out });
};
