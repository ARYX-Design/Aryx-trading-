/* GET /api/market?symbol=AAPL&interval=1h
   Proxies OHLC candles for stocks & metals from Twelve Data
   (https://twelvedata.com — free tier covers US stocks and XAU/USD,
   XAG/USD metals). The API key stays server-side.

   If TWELVEDATA_API_KEY is not set, responds { simulate: true } so the
   client falls back to its built-in simulation. Responses are cached
   briefly at the edge to stay within free-tier rate limits. */
const { json } = require('./_lib/util');

var TD_INTERVAL = { '15m': '15min', '1H': '1h', '4H': '4h', '1D': '1day' };
var ALLOWED = { 'AAPL': 'AAPL', 'NVDA': 'NVDA', 'XAU': 'XAU/USD', 'XAG': 'XAG/USD' };

module.exports = async function handler(req, res) {
  var q = req.query || {};
  var key = process.env.TWELVEDATA_API_KEY;
  var tdSymbol = ALLOWED[q.symbol];
  var interval = TD_INTERVAL[q.interval] || '1h';

  if (!tdSymbol) return json(res, 400, { error: 'unsupported_symbol' });
  if (!key) return json(res, 200, { simulate: true });

  var url = 'https://api.twelvedata.com/time_series' +
    '?symbol=' + encodeURIComponent(tdSymbol) +
    '&interval=' + interval +
    '&outputsize=150&format=JSON&apikey=' + encodeURIComponent(key);

  try {
    var r = await fetch(url);
    var data = await r.json();
    if (!data || data.status === 'error' || !Array.isArray(data.values)) {
      // rate-limited or bad symbol — let the client simulate rather than break
      return json(res, 200, { simulate: true, note: (data && data.message) || 'no_data' });
    }
    // Twelve Data returns newest-first; normalize to oldest-first candles.
    var candles = data.values.map(function (v) {
      var t = new Date(String(v.datetime).replace(' ', 'T')).getTime();
      return {
        t: isNaN(t) ? 0 : t,
        o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +(v.volume || 0)
      };
    }).reverse();

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    return json(res, 200, { candles: candles });
  } catch (e) {
    console.error('[aryx] market proxy error', e);
    return json(res, 200, { simulate: true, note: 'fetch_failed' });
  }
};
