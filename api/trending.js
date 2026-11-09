// GET /api/trending — live chart songs plus this day's / week's / month's challenge picks.
// Charts come from Apple's public iTunes top-songs feeds; previews from the iTunes lookup API.
// Cached at the edge for 6 hours. When Redis is connected, each period's picks are frozen
// on first use so every player in that period gets the same songs.
const { configured, pipeline } = require('../lib/redis');
const { currentPeriods } = require('../lib/periods');
const sponsor = require('../data/sponsor.json');

// Apple Music "most played" reflects listening; the older iTunes chart (purchases) is the fallback.
const FEEDS = [
  { cc: 'in', url: 'https://rss.applemarketingtools.com/api/v2/in/music/most-played/100/songs.json', fallback: 'https://itunes.apple.com/in/rss/topsongs/limit=100/json' },
  { cc: 'in', url: 'https://itunes.apple.com/in/rss/topsongs/limit=100/genre=1263/json' }, // India · Bollywood
  { cc: 'us', url: 'https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json', fallback: 'https://itunes.apple.com/us/rss/topsongs/limit=100/json' },
];
const REJECT_GENRE = /tamil|telugu|malayalam|kannada|marathi|bengali|bhojpuri|gujarati|devotional|spiritual|instrumental|children|comedy|classical|karaoke|christian|gospel|worship|soundtrack|score|easy listening|meditation/i;
const REJECT_TITLE = /\b(theme|chalisa|aarti|aarati|bhajan|mantra|stotram|stuti|jaap|ringtone|bgm|title track instrumental)\b/i;
const SCORE_ARTISTS = /Harshavardhan Rameshwar|John Stewart Eduri|Sanchit Balhara|Hans Zimmer|Nicholas Britell|Ludwig G|Ramin Djawadi/i;
const VERSION = /[\(\[][^\)\]]*\b(remix|unplugged|live|acoustic|lo-?fi|slowed|reverb|sped ?up|mashup|cover|reprise|jhankar|mix|version|instrumental|karaoke|female|male|sad|dj|edit|flip|house|trap)\b[^\)\]]*[\)\]]|\s[-–]\s.*\b(remix|unplugged|live|acoustic|lo-?fi|slowed|reverb|sped ?up|mashup|cover|reprise|mix|version)\b|\b(remix|mashup|lo-?fi|jhankar|ringtone)\b/i;
const PICKS = 10;
const PUNJABI = ['diljit', 'karan aujla', 'shubh', 'ap dhillon', 'sidhu moose', 'gurdas maan', 'hardy sandhu', 'harrdy sandhu',
  'jassie gill', 'ammy virk', 'gippy grewal', 'jasmine sandlas', 'sunanda sharma', 'talwiinder', 'bilal saeed', 'garry sandhu',
  'babbu maan', 'mankirt aulakh', 'arjan dhillon', 'prem dhillon', 'jass manak', 'satinder sartaaj', 'nimrat khaira',
  'gurnam bhullar', 'daler mehndi', 'bohemia', 'panjabi mc', 'r nait', 'gulab sidhu', 'cheema y'];

async function getJson(url, ms = 6000) {
  const r = await fetch(url, { headers: { 'User-Agent': 'bollyspot-trending' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}

async function feedIds(f) {
  // v2 feeds: {feed:{results:[{id}]}}; legacy feeds: {feed:{entry:[{id:{attributes:{'im:id'}}}]}}
  const read = j => j.feed.results ? j.feed.results.map(r => String(r.id)) : [].concat(j.feed.entry || []).map(e => e.id.attributes['im:id']);
  try { return read(await getJson(f.url)); } catch (e) {
    if (!f.fallback) throw e;
    return read(await getJson(f.fallback));
  }
}

async function chartIds() {
  const lists = await Promise.allSettled(FEEDS.map(feedIds));
  const best = new Map(); // id -> { rank, cc }
  const inUS = new Set();
  lists.forEach((res, fi) => {
    if (res.status !== 'fulfilled') return;
    res.value.forEach((id, rank) => {
      if (FEEDS[fi].cc === 'us') inUS.add(id);
      const prev = best.get(id);
      if (!prev || rank < prev.rank) best.set(id, { rank, cc: FEEDS[fi].cc === 'in' ? 'IN' : 'US', feed: fi });
    });
  });
  for (const [id, meta] of best) meta.local = !inUS.has(id);
  return best;
}

async function lookup(ids, country) {
  const out = [];
  for (let i = 0; i < ids.length; i += 150) {
    const j = await getJson(`https://itunes.apple.com/lookup?id=${ids.slice(i, i + 150).join(',')}&country=${country}`);
    out.push(...j.results.filter(r => r.wrapperType === 'track'));
  }
  return out;
}

function toSong(r, meta) {
  if (!r.previewUrl || VERSION.test(r.trackName) || REJECT_TITLE.test(r.trackName) || SCORE_ARTISTS.test(r.artistName)) return null;
  const film = /From [“"']([^”"']+)[”"']/.exec(r.trackName);
  // Indian film songs are often filed as "Soundtrack"; that genre is only rejected for the rest
  const genre = r.primaryGenreName || '';
  if (REJECT_GENRE.test(genre) && !(film && meta.cc === 'IN' && /soundtrack/i.test(genre))) return null;
  const title = r.trackName.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s[-–]\s.*$/, '').trim();
  if (title.replace(/[^a-z0-9]/gi, '').length < 2) return null;
  const g = r.primaryGenreName || '';
  let c = 'h', l = 'en';
  const punjabiArtist = PUNJABI.some(n => r.artistName.toLowerCase().includes(n));
  if (/punjabi/i.test(g) || (meta.cc === 'IN' && punjabiArtist)) { c = 'p'; l = 'pa'; }
  else if (/bollywood|filmi/i.test(g) || (film && meta.cc === 'IN')) { c = 'b'; l = 'hi'; }
  // charting in India but not in the US: an Indian independent release
  else if (meta.cc === 'IN' && (meta.local || /indian|sufi|ghazal|qawwali/i.test(g))) { c = 'i'; l = 'hi'; }
  return {
    id: String(r.trackId), t: title, a: r.artistName, m: film ? film[1] : '',
    y: r.releaseDate ? +r.releaseDate.slice(0, 4) : 0, rd: (r.releaseDate || '').slice(0, 10),
    p: r.previewUrl, i: (r.artworkUrl100 || '').replace('100x100', '300x300'),
    c, l, f: 1, g, rk: meta.rank, mk: meta.cc,
  };
}

function seeded(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const leadArtist = s => s.a.split(/,|&/)[0].trim().toLowerCase();
function shuffled(list, seedStr) {
  const arr = list.slice().sort((x, y) => (x.id < y.id ? -1 : 1));
  const r = seeded(seedStr);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// Builds one set of picks, spreading them across artists so a big album drop can't fill it.
function picker(n) {
  const chosen = [], count = new Map();
  return {
    chosen,
    take(list, seedStr, upTo, perArtist) {
      const want = Math.min(n, chosen.length + upTo);
      for (const s of shuffled(list, seedStr)) {
        if (chosen.length >= want) break;
        const a = leadArtist(s);
        if (chosen.includes(s.id) || (count.get(a) || 0) >= perArtist) continue;
        count.set(a, (count.get(a) || 0) + 1);
        chosen.push(s.id);
      }
    },
  };
}
function pick(list, seedStr, n) {
  const p = picker(n);
  p.take(list, seedStr, n, 99);
  return p.chosen;
}

function sponsorActive(period, now = new Date()) {
  if (!sponsor.active || !(sponsor.periods || []).includes(period)) return false;
  const day = now.toISOString().slice(0, 10);
  return day >= sponsor.start && day <= sponsor.end;
}

function computePicks(songs, sponsorIds, keys) {
  const now = Date.now();
  const age = s => (s.rd ? (now - Date.parse(s.rd)) / 86400000 : 9999);
  const byRank = songs.slice().sort((a, b) => a.rk - b.rk);
  const pools = {
    d: byRank.slice(0, 80),
    w: songs.filter(s => age(s) <= 21),
    m: songs.filter(s => age(s) <= 62),
  };
  // mostly Indian songs (the audience), with a slice of international hits;
  // short periods borrow from the wider charts before relaxing the per-artist cap
  const wider = { d: [], w: [pools.m, pools.d], m: [pools.d] };
  const picks = {};
  for (const p of ['d', 'w', 'm']) {
    const seed = 'trend-' + p + keys[p];
    const lead = sponsorActive(p) ? sponsorIds.slice(0, 4) : [];
    const pk = picker(PICKS);
    pk.chosen.push(...lead);
    const n = PICKS - lead.length;
    const indian = pl => pl.filter(s => s.c !== 'h');
    const intl = pl => pl.filter(s => s.c === 'h');
    pk.take(indian(pools[p]), seed + ':in', Math.ceil(n * 0.6), 2);
    for (const pl of wider[p]) pk.take(indian(pl), seed + ':in2', Math.ceil(n * 0.6) - (pk.chosen.length - lead.length), 2);
    pk.take(intl(pools[p]), seed + ':intl', PICKS, 1);
    for (const pl of wider[p]) pk.take(intl(pl), seed + ':intl2', PICKS, 1);
    if (pk.chosen.length < PICKS) pk.take(byRank.slice(0, 80), seed + ':rest', PICKS, 3);
    picks[p] = pk.chosen.slice(0, PICKS);
  }
  return picks;
}

module.exports = async (req, res) => {
  try {
    const keys = currentPeriods();
    const ranks = await chartIds();
    if (!ranks.size) throw new Error('charts unavailable');
    const sponsorIds = (sponsor.active ? sponsor.trackIds || [] : []).map(String);
    const byCountry = { IN: [], US: [] };
    for (const [id, meta] of ranks) byCountry[meta.cc].push(id);
    for (const id of sponsorIds) if (!ranks.has(id)) { byCountry.IN.push(id); ranks.set(id, { rank: 0, cc: 'IN' }); }
    const [inTracks, usTracks] = await Promise.all([lookup(byCountry.IN, 'IN'), lookup(byCountry.US, 'US')]);

    const songs = [];
    const seen = new Set();
    for (const r of [...inTracks, ...usTracks]) {
      const id = String(r.trackId);
      const s = toSong(r, ranks.get(id));
      if (!s) continue;
      const dedupe = (s.t + '|' + s.a.split(/,|&/)[0]).toLowerCase();
      if (seen.has(dedupe) && !sponsorIds.includes(id)) continue;
      seen.add(dedupe);
      if (sponsorIds.includes(id)) s.sp = 1;
      songs.push(s);
    }

    let picks = computePicks(songs, sponsorIds, keys);
    if (configured()) {
      // freeze each period's picks the first time they're computed
      const names = ['d', 'w', 'm'].map(p => `trend:picks:${p}:${keys[p]}`);
      const ttl = { d: 2 * 86400, w: 9 * 86400, m: 33 * 86400 };
      const setRes = await pipeline(['d', 'w', 'm'].map((p, i) => ['SET', names[i], JSON.stringify(picks[p]), 'NX', 'EX', ttl[p]]));
      const stored = await pipeline(names.map(n => ['GET', n]));
      ['d', 'w', 'm'].forEach((p, i) => { if (setRes[i] !== 'OK' && stored[i]) picks[p] = JSON.parse(stored[i]); });
      // frozen picks may reference songs that have since left the chart: fetch them back
      const have = new Set(songs.map(s => s.id));
      const missing = [...new Set(Object.values(picks).flat())].filter(id => !have.has(id));
      if (missing.length) for (const r of await lookup(missing, 'IN')) {
        const s = toSong(r, { rank: 99, cc: 'IN' });
        if (s) songs.push(s);
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({
      updated: new Date().toISOString(),
      periods: keys,
      picks,
      songs,
      sponsor: sponsor.active ? {
        name: sponsor.name, headline: sponsor.headline, url: sponsor.url, color: sponsor.color,
        periods: ['d', 'w', 'm'].filter(p => sponsorActive(p)),
      } : null,
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'trending unavailable', detail: String(e.message || e).slice(0, 160) });
  }
};
