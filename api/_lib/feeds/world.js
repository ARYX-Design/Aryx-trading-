/* GET /api/world?part=news | trend
   World-crisis monitor for the Macro tab, from the GDELT Project's DOC 2.0
   API (https://www.gdeltproject.org — free, no key; monitors world news in
   100+ languages, updated every 15 minutes).

     part=news  → the most relevant crisis headlines of the last 48h,
                  tagged by topic (conflict, sanctions/trade, financial,
                  energy, unrest)
     part=trend → daily "crisis coverage intensity": the share of all
                  monitored English-language news matching crisis terms,
                  over the last 6 months
     part=topic&q=… → daily news-attention for one theme (e.g. "GTA 6"),
                  last month — used by the Early Movers "Themes" mode

   GDELT asks for at most one request every ~5 seconds, so each part is a
   single upstream call and responses are cached at the edge for 30 min. */
const { json } = require('../util');

var HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AryxMacro/1.0)', 'Accept': 'application/json,*/*' };
var QUERY = '(war OR invasion OR airstrike OR missile OR "military escalation" OR sanctions OR tariffs OR "trade war" ' +
  'OR coup OR "nuclear threat" OR blockade OR "debt crisis" OR "bank collapse" OR "oil supply" OR "state of emergency") sourcelang:english';
var BASE = 'https://api.gdeltproject.org/api/v2/doc/doc?format=json&query=' + encodeURIComponent(QUERY);

var TOPICS = [
  ['conflict', /\b(war|wars|invasion|invade|missile|airstrike|air strike|strike[sd]?|troops|military|army|attack|drone|ceasefire|nuclear|bomb|shelling|militant|hostage)/i],
  ['trade', /\b(sanction|tariff|trade war|export ban|export control|embargo|blockade)/i],
  ['finance', /\b(bank|default|debt|recession|crash|bailout|bond|currency|inflation|imf|downgrade|markets? (fall|plunge|tumble))/i],
  ['energy', /\b(oil|gas|opec|pipeline|energy|diesel|fuel|refiner|lng|power grid|blackout)/i],
  ['unrest', /\b(coup|protest|unrest|riot|state of emergency|martial law|election crisis|government collapse)/i]
];

function topicOf(title) {
  for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i][1].test(title)) return TOPICS[i][0];
  return 'other';
}
function gdeltDate(s) {   // 20261101T153000Z -> ISO
  var m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/.exec(String(s || ''));
  return m ? m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] || '00') + ':' + (m[5] || '00') + ':' + (m[6] || '00') + 'Z' : null;
}
async function getJson(url) {
  var r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('gdelt_' + r.status);
  var text = await r.text();
  try { return JSON.parse(text); } catch (e) { throw new Error('gdelt_not_json: ' + text.slice(0, 120)); }
}

async function news() {
  var d = await getJson(BASE + '&mode=artlist&maxrecords=75&timespan=2d&sort=hybridrel');
  var seen = {}, out = [];
  (d && d.articles || []).forEach(function (a) {
    var title = String(a.title || '').replace(/\s+/g, ' ').trim();
    var url = String(a.url || '');
    if (!title || !/^https?:\/\//.test(url)) return;
    var key = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 70);
    if (seen[key]) return; seen[key] = 1;
    out.push({ title: title.slice(0, 220), url: url, domain: String(a.domain || '').slice(0, 60),
      country: String(a.sourcecountry || '').slice(0, 40), seen: gdeltDate(a.seendate), topic: topicOf(title) });
  });
  return { articles: out.slice(0, 40) };
}

async function trend() {
  var d = await getJson(BASE + '&mode=timelinevol&timespan=6m');
  var tl = d && d.timeline && d.timeline[0] && d.timeline[0].data || [];
  var byDay = {};
  tl.forEach(function (p) { var iso = gdeltDate(p.date); if (iso && isFinite(+p.value)) { var day = iso.slice(0, 10); (byDay[day] = byDay[day] || []).push(+p.value); } });
  var series = Object.keys(byDay).sort().map(function (day) {
    var v = byDay[day]; return [day, Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 10000) / 10000];
  });
  return { trend: series };
}

// news attention for a single theme; GDELT only allows parentheses around OR'd terms
async function topic(q) {
  var clean = String(q || '').replace(/[^A-Za-z0-9 "'.\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (clean.replace(/[^A-Za-z0-9]/g, '').length < 3) throw new Error('bad_topic');
  var query = (/ OR /.test(clean) ? '(' + clean + ')' : clean) + ' sourcelang:english';
  var d = await getJson('https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=timelinevol&timespan=1m&query=' + encodeURIComponent(query));
  var tl = d && d.timeline && d.timeline[0] && d.timeline[0].data || [], byDay = {};
  tl.forEach(function (p) { var iso = gdeltDate(p.date); if (iso && isFinite(+p.value)) { var day = iso.slice(0, 10); (byDay[day] = byDay[day] || []).push(+p.value); } });
  return { q: clean, trend: Object.keys(byDay).sort().map(function (day) {
    var v = byDay[day]; return [day, Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 100000) / 100000]; }) };
}

module.exports = async function handler(req, res) {
  var qp = (req.query && req.query.part) || '';
  var part = qp === 'trend' || qp === 'topic' ? qp : 'news';
  try {
    var out = part === 'trend' ? await trend() : part === 'topic' ? await topic(req.query.q) : await news();
    var ok = part === 'news' ? out.articles.length > 0 : out.trend.length > (part === 'topic' ? 5 : 10);
    if (ok) res.setHeader('Cache-Control', part === 'topic' ? 's-maxage=3600, stale-while-revalidate=10800' : 's-maxage=1800, stale-while-revalidate=7200');
    return json(res, 200, Object.assign({ part: part, asOf: new Date().toISOString() }, out));
  } catch (e) {
    console.error('[aryx] world', part, e && e.message);
    return json(res, 200, { part: part, error: 'unavailable' });
  }
};
