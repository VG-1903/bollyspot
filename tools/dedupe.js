// Collapses spelling-variant duplicates in data/songs.json.
// Pass 1: within the same film. Pass 2: within the same primary artist.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'songs.json');
const songs = JSON.parse(fs.readFileSync(file, 'utf8'));

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const primary = a => norm((a.split(/,|&|feat\.?/i)[0] || ''));

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

const examples = [];
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
        if (examples.length < 15) examples.push(`${s.t}  ->  ${hit.s.t}`);
      } else kept.push({ s, n });
    }
  }
  return list.filter(s => !dropped.has(s));
}

// remix versions and instrumentals aren't guessable songs (Hindi/Indie only:
// English titles like "Theme from New York, New York" are real songs)
const remixRx = /\b(remix|trap|synthwave|future funk|lo-?fi|slowed|reverb|bass boosted|reprise|revisited|cover|cover version|rock version|acoustic|mix|version)\b/i;
const instrRx = /\b(title music|theme|instrumental|karaoke)\b/i;
const cleaned = songs.filter(s =>
  s.c === 'h' ? !/\bremix\b/i.test(s.t) : !(remixRx.test(s.t) || instrRx.test(s.t)));
console.log(`removed ${songs.length - cleaned.length} remix/instrumental entries`);

let out = pass(cleaned, s => (s.m ? s.c + '|' + norm(s.m) : null), true);
const afterFilm = out.length;
out = pass(out, s => s.c + '|' + s.l + '|' + primary(s.a), false);

out.sort((a, b) => (a.y || 0) - (b.y || 0));
fs.writeFileSync(file, JSON.stringify(out));
console.log(`dedupe: ${cleaned.length} -> ${afterFilm} (film pass) -> ${out.length} (artist pass)`);
console.log('examples:\n  ' + examples.join('\n  '));
