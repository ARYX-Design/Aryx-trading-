/* GET /api/feed/<name>?...  — one serverless function for every market-data feed.

   Vercel's Hobby plan allows at most 12 serverless functions per deployment,
   so the data feeds share this single dynamic route instead of one function
   each. Add new feeds as modules in api/_lib/feeds/ and list them below.

     /api/feed/fred    FRED economic series        (api/_lib/feeds/fred.js)
     /api/feed/stocks  stock / ETF / index candles  (api/_lib/feeds/stocks.js)
     /api/feed/world   GDELT world-crisis news      (api/_lib/feeds/world.js)
     /api/feed/metals  daily gold & silver          (api/_lib/feeds/metals.js)
     /api/feed/market  Twelve Data candles          (api/_lib/feeds/market.js)

   The old paths (/api/fred, /api/stocks, ...) are rewritten here in vercel.json. */
const { json } = require('../_lib/util');

var FEEDS = {
  fred: require('../_lib/feeds/fred'),
  stocks: require('../_lib/feeds/stocks'),
  world: require('../_lib/feeds/world'),
  metals: require('../_lib/feeds/metals'),
  market: require('../_lib/feeds/market')
};

module.exports = async function handler(req, res) {
  var name = String((req.query && req.query.name) || '').toLowerCase();
  var feed = Object.prototype.hasOwnProperty.call(FEEDS, name) ? FEEDS[name] : null;
  if (!feed) return json(res, 404, { error: 'unknown_feed' });
  return feed(req, res);
};
