// Cleans tools/out/catalog.raw.json and writes the packed, served catalog to data/songs.json.
// - drops alternate recordings and instrumentals that slipped through
// - collapses spelling-variant duplicates (within a film, then within an artist)
// - strips the shared iTunes URL prefixes (the client rebuilds them)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const input = process.argv[2] || path.join(__dirname, 'out', 'catalog.raw.json');
const output = path.join(root, 'data', 'songs.json');
const songs = JSON.parse(fs.readFileSync(input, 'utf8'));

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const primary = a => norm((a.split(/,|&|feat\.?/i)[0] || ''));

const indianVersionRx = /\b(remix|trap|synthwave|future funk|lo-?fi|slowed|reverb|bass boosted|reprise|revisited|recreated|cover|unplugged|acoustic|mix|version|jhankar|mashup|dj)\b/i;
const englishVersionRx = /\b(remix|mashup|sped ?up|slowed|lo-?fi)\b/i;
const instrRx = /\b(title music|theme|instrumental|karaoke)\b/i;
const cleaned = songs.filter(s => {
  if (!s.p || !s.t) return false;
  if (s.c === 'h') return !englishVersionRx.test(s.t) && !/\b(instrumental|karaoke)\b/i.test(s.t);
  return !(indianVersionRx.test(s.t) || instrRx.test(s.t));
});
console.log(`removed ${songs.length - cleaned.length} version/instrumental entries`);

// Artist searches return loosely related results; for Indie, Punjabi and Hollywood keep a
// song only when its credits name one of the searched artists.
const sources = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const GENERIC = /\b(rapper|band|india|singer|satisfya|pakistan|bollywood|hits)\b/g;
const ALIASES = {
  'rose blackpink': ['rose'], 'the weeknd daft punk': ['weeknd', 'daftpunk'], 'simon & garfunkel': ['simon', 'garfunkel'],
  '2pac': ['2pac', 'tupac'], 'the notorious b.i.g.': ['notorious'], 'mc stan': ['mcstan', 'mcst'],
  'coke studio pakistan': ['cokestudio'], 'young stunners': ['youngstunners', 'talha'], 'cheema y': ['cheemay', 'cheema'],
  'r nait': ['rnait', 'nait'], 'sukh-e': ['sukhe'], 'kr$na': ['krna', 'krsna'],
};
const allow = {};
for (const [cat, key] of [['i', 'indie'], ['p', 'punjabi'], ['h', 'hollywood']]) {
  allow[cat] = sources[key].flatMap(q => ALIASES[q] || [norm(q.replace(GENERIC, ''))]).filter(n => n.length >= 3);
}
const before = cleaned.length;
for (let i = cleaned.length - 1; i >= 0; i--) {
  const s = cleaned[i];
  if (!allow[s.c]) continue;
  const a = norm(s.a);
  if (!allow[s.c].some(n => a.includes(n))) cleaned.splice(i, 1);
}
console.log(`removed ${before - cleaned.length} songs by artists outside the searched lists`);

// mashups: "Tum Hi Ho-Rehnuma" (left half is another song's title) or mixtape/mashup albums
const titlesByCat = new Map();
for (const s of cleaned) {
  if (!titlesByCat.has(s.c)) titlesByCat.set(s.c, new Set());
  titlesByCat.get(s.c).add(norm(s.t));
}
const beforeMash = cleaned.length;
for (let i = cleaned.length - 1; i >= 0; i--) {
  const s = cleaned[i];
  const m = /^(.{4,}?\S)-(\S.*)$/.exec(s.t);
  const leftIsSong = m && titlesByCat.get(s.c).has(norm(m[1])) && norm(m[1]) !== norm(s.t);
  if (leftIsSong || /\b(mixtape|mashup|acoustics|unplugged|lo-?fi)\b/i.test(s.m || '')) cleaned.splice(i, 1);
}
console.log(`removed ${beforeMash - cleaned.length} mashups`);

function lev(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}
function similar(a, b, allowPrefix) {
  if (a === b) return true;
  const L = Math.min(a.length, b.length);
  if (allowPrefix && L >= 8 && (a.startsWith(b) || b.startsWith(a))) return true;
  const cap = L >= 14 ? 2 : L >= 6 ? 1 : 0;
  return cap > 0 && lev(a, b, cap) <= cap;
}
function better(x, y) {
  if ((x.f || 0) !== (y.f || 0)) return (y.f || 0) - (x.f || 0);
  const xy = x.y > 0 ? x.y : 9999, yy = y.y > 0 ? y.y : 9999;
  if (xy !== yy) return xy - yy;
  return x.t.length - y.t.length;
}
function pass(list, keyFn, allowPrefix) {
  const groups = new Map();
  for (const s of list) {
    const k = keyFn(s);
    if (k === null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const dropped = new Set();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort(better);
    const kept = [];
    for (const s of g) {
      const n = norm(s.t);
      const hit = kept.find(k => similar(k.n, n, allowPrefix));
      if (hit) {
        hit.s.f = Math.max(hit.s.f || 0, s.f || 0);
        if (s.y > 0 && (!(hit.s.y > 0) || s.y < hit.s.y)) hit.s.y = s.y;
        if (s.m && !hit.s.m) hit.s.m = s.m;
        dropped.add(s);
      } else kept.push({ s, n });
    }
  }
  return list.filter(s => !dropped.has(s));
}

let out = pass(cleaned, s => (s.m ? s.c + '|' + norm(s.m) : null), true);
const afterFilm = out.length;
out = pass(out, s => s.c + '|' + s.l + '|' + primary(s.a), false);

const P_PREFIX = 'https://audio-ssl.itunes.apple.com/itunes-assets/';
const ART_RX = /^https:\/\/is(\d)-ssl\.mzstatic\.com\/image\/thumb\/(.+)\/\d+x\d+bb\.jpg$/;
const packed = out
  .sort((a, b) => (a.y || 0) - (b.y || 0))
  .map(s => {
    const o = { t: s.t, a: s.a, y: s.y || 0, c: s.c, l: s.l };
    if (s.m) o.m = s.m;
    if (s.f) o.f = 1;
    if (s.g) o.g = s.g;
    o.p = s.p.startsWith(P_PREFIX) ? s.p.slice(P_PREFIX.length) : s.p;
    const am = ART_RX.exec(s.art || '');
    o.i = am ? am[1] + '|' + am[2] : (s.art || '');
    return o;
  });

fs.writeFileSync(output, JSON.stringify(packed));
const by = c => packed.filter(s => s.c === c).length;
console.log(`dedupe: ${cleaned.length} -> ${afterFilm} (film pass) -> ${out.length} (artist pass)`);
console.log(`wrote ${output}: ${packed.length} songs | Bollywood ${by('b')} | Hollywood ${by('h')} | Indie ${by('i')} | Punjabi ${by('p')} | famous ${packed.filter(s => s.f).length} | ${(fs.statSync(output).size / 1048576).toFixed(1)} MB`);
