// Song search: prefix + phonetic (Hinglish spelling variants) + typo tolerance + initials,
// ranked title-first and famous-first.

const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = s => fold(s).replace(/[^a-z0-9]/g, '');
export const words = s => fold(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

// Collapses the usual romanisation variants of Hindi/Punjabi words:
// tujhe/tuje, pyaar/pyar, zindagi/jindagi, hai/hay, dill/dil, shayad/sayad.
export function phon(w) {
  let x = w
    .replace(/ph/g, 'f').replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/jh/g, 'j')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b').replace(/sh/g, 's')
    .replace(/ch/g, 'c').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/z/g, 'j')
    .replace(/w/g, 'v').replace(/x/g, 'ks').replace(/y/g, 'i');
  x = x.replace(/ee|ii/g, 'i').replace(/oo|ou/g, 'u').replace(/ai|ei/g, 'e');
  x = x.replace(/(.)\1+/g, '$1');
  if (x.length > 2) x = x.replace(/h$/, '');
  return x;
}

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

const initials = ws => ws.map(w => w[0]).join('');

export function indexSong(s) {
  s.k = norm(s.t);
  s.tw = words(s.t);
  s.tp = s.tw.map(phon);
  s.ow = words((s.m || '') + ' ' + s.a);
  s.op = s.ow.map(phon);
  s.tc = phon(s.k);
  s.ti = initials(s.tw);
  s.mi = s.m ? initials(words(s.m)) : '';
  s.al = s.a.toLowerCase();
}

const NONE = 99;
function tokenScore(qt, qp, ws, ps, isLast) {
  let best = NONE;
  const fuzzyCap = qp.length >= 7 ? 2 : qp.length >= 4 ? 1 : 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], p = ps[i];
    if (w === qt) return 0;
    if (p === qp) { best = Math.min(best, 0.4); continue; }
    const canPrefix = isLast || qt.length >= 3;
    if (canPrefix && w.startsWith(qt)) { best = Math.min(best, 1 - 0.5 * (qt.length / w.length)); continue; }
    if (canPrefix && p.startsWith(qp)) { best = Math.min(best, 1.4); continue; }
    if (fuzzyCap && (p[0] === qp[0] || p.slice(1, 3) === qp.slice(1, 3))) {
      let d = lev(qp, p, fuzzyCap);
      if (isLast && p.length > qp.length) d = Math.min(d, lev(qp, p.slice(0, qp.length), fuzzyCap));
      if (d <= fuzzyCap) best = Math.min(best, 2 + d);
    }
  }
  return best;
}

function songScore(s, q) {
  let total = 0, titleHits = 0, failed = false;
  for (let i = 0; i < q.toks.length; i++) {
    const isLast = i === q.toks.length - 1;
    const t = tokenScore(q.toks[i], q.phons[i], s.tw, s.tp, isLast);
    const o = tokenScore(q.toks[i], q.phons[i], s.ow, s.op, isLast) + 1.6;
    const b = Math.min(t, o);
    if (b >= NONE) { failed = true; break; }
    total += b;
    if (t <= o) titleHits++;
  }
  if (failed) {
    // typed without spaces ("tumhiho") or initials ("ddlj", "kkhh")
    if (q.compact.length >= 4 && s.tc.startsWith(q.compact)) total = 1.2;
    else if (q.compact.length >= 5 && s.tc.includes(q.compact)) total = 2.6;
    else if (q.raw.length >= 2 && q.raw.length <= 6 && q.toks.length === 1 && (s.ti === q.raw || s.mi === q.raw)) total = s.ti === q.raw ? 1 : 1.6;
    else return null;
  } else {
    if (s.tw[0] && s.tw[0].startsWith(q.toks[0])) total -= 0.6;
    if (titleHits === q.toks.length && q.toks.length === s.tw.length) total -= 0.5;
  }
  if (s.f) total -= 0.8;
  total += 0.03 * s.tw.length;
  return total;
}

export function search(query, songs, limit = 8) {
  const toks = words(query);
  const raw = norm(query);
  if (raw.length < 2 || !toks.length) return [];
  const q = { toks, phons: toks.map(phon), compact: phon(raw), raw };
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
    for (let i = 0; i < qs.length; i++) {
      if (w.startsWith(qs[i])) {
        const n = Math.min(part.length, qs[i].length + (part.length - w.length));
        return '<mark>' + esc(part.slice(0, n)) + '</mark>' + esc(part.slice(n));
      }
      if (phon(w).startsWith(qp[i])) return '<mark>' + esc(part) + '</mark>';
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
