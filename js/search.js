// Song search. Understands Hinglish spelling variants, dropped vowels ("kbhi kbhi"),
// typos and swapped letters, missing spaces, initials ("ddlj"), movie and artist names,
// filler words ("song from kabir singh") and context words ("arijit sad", "90s punjabi").
// Ranked title-first and famous-first.

const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = s => fold(s).replace(/[^a-z0-9]/g, '');
export const words = s => fold(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

// Collapses the usual romanisation variants of Hindi/Punjabi words:
// tujhe/tuje, pyaar/pyar, zindagi/jindagi, hai/hay, mauja/moja, chaiyya/chaiya.
export function phon(w) {
  let x = w.replace(/chh/g, 'c')
    .replace(/ph/g, 'f').replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/jh/g, 'j')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b').replace(/sh/g, 's')
    .replace(/ch/g, 'c').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/z/g, 'j')
    .replace(/w/g, 'v').replace(/x/g, 'ks').replace(/y/g, 'i');
  x = x.replace(/(.)\1+/g, '$1');
  x = x.replace(/ee/g, 'i').replace(/oo|ou/g, 'u').replace(/ai|ei/g, 'e').replace(/au/g, 'o');
  x = x.replace(/(.)\1+/g, '$1');
  if (x.length > 2) x = x.replace(/h$/, '');
  return x;
}

// plain edit distance (used for judging typed guesses and by the importer)
export function lev(a, b, cap) {
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

// Edit distance where vowels (and the h people drop in Hinglish) are cheap and
// swapping two neighbouring letters is one slip: "kbhi"~"kabhi", "phela"~"pehla".
const SOFT = { a: 1, e: 1, i: 1, o: 1, u: 1, h: 1 };
const gap = c => (SOFT[c] ? 0.5 : 1);
const ROW = 64;
const rows = [new Float32Array(ROW), new Float32Array(ROW), new Float32Array(ROW)];
function wdist(a, b, cap) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > cap * 2) return cap + 1;
  if (m >= ROW) return cap + 1;
  let pp = null, prev = rows[0], cur, spare = rows[2];
  cur = rows[1];
  prev[0] = 0;
  for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + gap(b[j - 1]);
  for (let i = 1; i <= n; i++) {
    cur[0] = prev[0] + gap(a[i - 1]);
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const x = a[i - 1], y = b[j - 1];
      const sub = x === y ? 0 : (SOFT[x] && SOFT[y] && x !== 'h' && y !== 'h' ? 0.4 : 1);
      let v = Math.min(prev[j] + gap(x), cur[j - 1] + gap(y), prev[j - 1] + sub);
      if (pp && j > 1 && x === b[j - 2] && a[i - 2] === y && x !== y) v = Math.min(v, pp[j - 2] + 0.7);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    const t = pp || spare; pp = prev; prev = cur; cur = t;
  }
  return prev[m];
}

/* ---------------------------------------------------------------- word index */
// Every distinct word in the catalog gets an id; a query word is compared against
// each distinct word once (and cached), so scoring a song is just array lookups.
const vocab = new Map();
const vWords = [], vPhons = [];
function wid(w) {
  let id = vocab.get(w);
  if (id === undefined) { id = vWords.length; vocab.set(w, id); vWords.push(w); vPhons.push(phon(w)); }
  return id;
}
const ids = ws => Int32Array.from(ws, wid);
const initials = ws => ws.map(w => w[0]).join('');

export function indexSong(s) {
  const tw = words(s.t);
  const mw = s.m ? words(s.m) : [];
  s.k = norm(s.t);
  s.tc = phon(s.k);
  s.ti = initials(tw);
  s.mi = mw.length ? initials(mw) : '';
  s.al = s.a.toLowerCase();
  s.tI = ids(tw);
  s.mI = ids(mw.length >= 3 ? mw.concat(s.mi) : mw);   // "yjhd", "ddlj" count as movie words
  s.aI = ids(words(s.a));
}

const NONE = 99;
function fuzzyCap(len) { return len <= 1 ? 0 : len === 2 ? 0.5 : len <= 4 ? 1 : len <= 7 ? 1.5 : 2.5; }

function wordCost(q, qp, w, p, isLast, cap) {
  if (w === q) return 0;
  if (p === qp) return 0.3;
  let best = NONE;
  const canPrefix = isLast || q.length >= 3;
  if (canPrefix && w.startsWith(q)) best = 1 - 0.5 * (q.length / w.length);
  else if (canPrefix && p.startsWith(qp)) best = 1.3;
  if (cap && (p[0] === qp[0] || w[0] === q[0] || p.slice(1, 3) === qp.slice(1, 3))) {
    let d = Math.min(wdist(qp, p, cap), wdist(q, w, cap));
    if (isLast && qp.length >= 4 && p.length > qp.length + 1) d = Math.min(d, wdist(qp, p.slice(0, qp.length), cap) + 0.3);
    if (p[0] !== qp[0] && w[0] !== q[0]) d += 0.5;
    if (d <= cap) best = Math.min(best, 0.8 + d);
  }
  return best;
}

// chat spellings
const ALIAS = { u: 'you', r: 'are', ur: 'your', n: 'and', nd: 'and', luv: 'love', lv: 'love', 2: 'to', 4: 'for', nt: 'not', plz: 'please' };

let costCache = new Map();
function costs(tok, isLast) {
  const key = tok + (isLast ? '|1' : '|0');
  let arr = costCache.get(key);
  if (arr && arr.length === vWords.length) return arr;
  arr = new Float32Array(vWords.length);
  const qp = phon(tok), cap = fuzzyCap(qp.length);
  const al = ALIAS[tok], alp = al ? phon(al) : '';
  for (let i = 0; i < arr.length; i++) {
    let c = wordCost(tok, qp, vWords[i], vPhons[i], isLast, cap);
    if (al && c > 0.2) c = Math.min(c, wordCost(al, alp, vWords[i], vPhons[i], false, 0) + 0.2);
    arr[i] = c;
  }
  if (costCache.size > 300) costCache = new Map();
  costCache.set(key, arr);
  return arr;
}

/* ---------------------------------------------------------------- query understanding */
// words that describe the request rather than the song
const NOISE = new Set(['song', 'songs', 'gana', 'gaana', 'gaane', 'gane', 'geet', 'track', 'title', 'from', 'movie', 'film', 'by', 'the', 'wala', 'wali', 'waala', 'of', 'in', 'ft', 'feat', 'featuring', 'singer', 'sung', 'album', 'ost', 'lyrics', 'full', 'audio', 'video', 'romantic', 'best', 'hit', 'hits', 'famous', 'top']);
// words that can mean a kind of song when they are not part of its name
const old = s => s.y > 0 && s.y < 2000;
const fresh = s => s.y >= 2024;
const sad = s => s.mood === 's';
const peppy = s => s.mood === 'p';
const CONTEXT = {
  sad, emotional: sad, breakup: sad, heartbreak: sad,
  party: peppy, dance: peppy, peppy, upbeat: peppy,
  old, purane: old, purana: old, classic: s => s.y > 0 && s.y < 1990,
  new: fresh, latest: fresh, naya: fresh, naye: fresh,
  '70s': s => s.y >= 1970 && s.y < 1980, '80s': s => s.y >= 1980 && s.y < 1990, '90s': s => s.y >= 1990 && s.y < 2000,
  '2000s': s => s.y >= 2000 && s.y < 2010, '2010s': s => s.y >= 2010 && s.y < 2020, '2020s': s => s.y >= 2020,
  punjabi: s => s.c === 'p', bollywood: s => s.c === 'b', hindi: s => s.l === 'hi', hollywood: s => s.c === 'h',
  english: s => s.l === 'en', indie: s => s.c === 'i',
};

function parse(query) {
  const raw = words(query);
  if (!raw.length) return null;
  const toks = raw.map((w, i) => ({
    w,
    noise: NOISE.has(w),
    ctx: (Object.prototype.hasOwnProperty.call(CONTEXT, w) && CONTEXT[w]) || (/^(19|20)\d\d$/.test(w) ? s => s.y === +w : null),
    last: i === raw.length - 1,
  }));
  if (toks.every(t => t.noise)) toks.forEach(t => { t.noise = false; });
  let textLen = 0;
  for (const t of toks) {
    t.arr = costs(t.w, t.last);
    if (!t.noise && !t.ctx) textLen += t.w.length;
  }
  const core = toks.filter(t => !t.noise).map(t => t.w);
  return { toks, textLen, compact: phon(core.join('')), raw: core.join(''), single: core.length === 1 };
}

function best(arr, idList) {
  let b = NONE;
  for (let i = 0; i < idList.length; i++) { const c = arr[idList[i]]; if (c < b) b = c; }
  return b;
}

function songScore(s, q) {
  // word-by-word path: each query word may match the title, the movie or the artist
  let missed = false, mixed = 0, pure = 0, pureOk = true, matched = 0, hits = 0, titleHits = 0, textToks = 0;
  for (const t of q.toks) {
    const tc = best(t.arr, s.tI);
    const oc = Math.min(best(t.arr, s.mI), best(t.arr, s.aI));
    const b = Math.min(tc, oc + 1);
    if (t.noise) { const v = Math.min(b, 0.1); mixed += v; pure += v; continue; }
    if (!t.ctx) textToks++;
    if (b < NONE) {
      mixed += b; hits++;
      if (!t.ctx) matched += b >= 1.2 ? t.w.length / 2 : t.w.length;
      if (tc <= oc + 1) titleHits++;
      if (oc < NONE) pure += oc + 0.35; else pureOk = false;
    } else if (t.ctx && t.ctx(s)) {
      mixed += 0.3; pure += 0.3; hits++;
    } else {
      mixed += 3; pureOk = false; missed = true;
    }
  }
  let total = NONE;
  if (hits && (!missed || matched >= q.textLen * 0.5)) {
    // a query that is entirely a movie or artist name lists that movie's / artist's songs
    total = pureOk ? Math.min(mixed, pure) : mixed;
    if (titleHits && s.tI.length && q.toks[0].arr[s.tI[0]] <= 1) total -= 0.4;
    if (titleHits === textToks && textToks === s.tI.length) total -= 0.5;
  }
  // whole-title path: typed without spaces, with spaces in the wrong place, or as initials
  const c = q.compact, k = s.tc;
  if (c.length >= 3 && k === c) total = Math.min(total, 0.1);
  else if (c.length >= 4 && k.startsWith(c)) total = Math.min(total, 0.7 + 0.5 * (1 - c.length / k.length));
  else if (total >= NONE) {
    if (c.length >= 5 && k.includes(c)) total = 2.6;
    else if (q.single && q.raw.length >= 2 && q.raw.length <= 6 && s.ti === q.raw) total = 1;
    else if (c.length >= 6 && k[0] === c[0] && Math.abs(k.length - c.length) <= 2) {
      const d = wdist(c, k, 1.5);
      if (d <= 1.5) total = 2 + d;
    }
  }
  if (total >= NONE) return null;
  if (s.f) total -= 0.8;
  return total + 0.03 * s.tI.length;
}

export function search(query, songs, limit = 8) {
  if (norm(query).length < 2) return [];
  const q = parse(query);
  if (!q) return [];
  const hits = [];
  for (const s of songs) {
    const sc = songScore(s, q);
    if (sc !== null) hits.push([sc, s]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].t.length - b[1].t.length);
  const seen = new Set(), out = [];
  for (const [, s] of hits) {
    const key = s.k + '|' + norm(s.a.split(/,|&/)[0]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function highlight(title, query) {
  const qs = words(query);
  const qp = qs.map(phon);
  return title.split(/(\s+)/).map(part => {
    const w = norm(part);
    if (!w) return esc(part);
    const p = phon(w);
    for (let i = 0; i < qs.length; i++) {
      if (w.startsWith(qs[i])) {
        const n = Math.min(part.length, qs[i].length + (part.length - w.length));
        return '<mark>' + esc(part.slice(0, n)) + '</mark>' + esc(part.slice(n));
      }
      const cap = fuzzyCap(qp[i].length);
      if (p.startsWith(qp[i]) || (cap && p[0] === qp[i][0] && wdist(qp[i], p, cap) <= cap)) return '<mark>' + esc(part) + '</mark>';
    }
    return esc(part);
  }).join('');
}

// typed guess with no suggestion picked: forgive small spelling mistakes
export function closeEnough(typed, song) {
  const g = phon(norm(typed));
  const k = song.tc;
  if (g.length < 2) return false;
  const cap = k.length >= 9 ? 2 : k.length >= 5 ? 1 : 0;
  return g === k || lev(g, k, cap) <= cap;
}
