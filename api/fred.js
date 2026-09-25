/* GET /api/fred?series=T10Y3M,BAMLH0A0HYM2,...
   Proxies economic series from FRED (Federal Reserve Bank of St. Louis,
   https://fred.stlouisfed.org — free API key). Used by the Macro tab's
   crisis / recession early-warning panel. The API key stays server-side.

   Responds { series: { ID: { latest, date, hist:[[date,value],...] } } }
   (hist is oldest-first, ~3 years, thinned to <=160 points), or
   { missing: true } when FRED_API_KEY is not configured. FRED data updates
   at most daily, so responses are cached at the edge for an hour. */
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

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function fetchSeries(id, key) {
  var url = 'https://api.stlouisfed.org/fred/series/observations' +
    '?series_id=' + id +
    '&api_key=' + encodeURIComponent(key) +
    '&file_type=json&sort_order=asc&observation_start=' + isoDaysAgo(3 * 365 + 30);
  var r = await fetch(url);
  if (!r.ok) throw new Error('fred_' + r.status);
  var data = await r.json();
  var obs = (data && data.observations || [])
    .filter(function (o) { return o && o.value !== '.' && o.value !== '' && isFinite(+o.value); })
    .map(function (o) { return [o.date, +o.value]; });
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
  if (!key) return json(res, 200, { missing: true });

  var out = {};
  await Promise.all(ids.map(function (id) {
    return fetchSeries(id, key)
      .then(function (s) { if (s) out[id] = s; })
      .catch(function (e) { console.error('[aryx] fred', id, e && e.message); });
  }));

  if (Object.keys(out).length) res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return json(res, 200, { series: out });
};
