// Shared challenges: everyone with the same code gets the same songs.
// Room codes carry their own settings, so joining needs no server round-trip.
export const ROUNDS = 10;
export const ROOM_CATS = ['b', 'h', 'i', 'p'];
export const ROOM_LANGS = ['hi', 'en', 'pa'];
export const ROOM_ERAS = ['classic', '90s', '2000s', '2010s', '2020s'];
export const ROOM_MOODS = ['p', 's'];
export const DIFF_IDS = ['easy', 'medium', 'hard', 'expert', 'imp'];
export const TRY_OPTS = [3, 4, 5, 6];

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededPick(pool, seed, n) {
  const arr = pool.slice();
  const r = rng(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

const mask = (set, all) => all.reduce((m, v, i) => (set.has(v) ? m | (1 << i) : m), 0);
const unmask = (m, all) => new Set(all.filter((_, i) => m & (1 << i)));

// layout (low -> high bits): tries 2 | diff 3 | famous 1 | moods 2 | eras 5 | langs 3 | cats 4 | seed 30
export function encodeRoom(cfg) {
  let v = BigInt(cfg.seed & 0x3fffffff);
  v = (v << 4n) | BigInt(mask(cfg.cats, ROOM_CATS));
  v = (v << 3n) | BigInt(mask(cfg.langs, ROOM_LANGS));
  v = (v << 5n) | BigInt(mask(cfg.eras, ROOM_ERAS));
  v = (v << 2n) | BigInt(mask(cfg.moods, ROOM_MOODS));
  v = (v << 1n) | BigInt(cfg.famous ? 1 : 0);
  v = (v << 3n) | BigInt(Math.max(0, DIFF_IDS.indexOf(cfg.diff)));
  v = (v << 2n) | BigInt(Math.max(0, TRY_OPTS.indexOf(cfg.tries)));
  return v.toString(36).padStart(6, '0');
}

export function decodeRoom(code) {
  code = String(code || '').trim().toLowerCase();
  const m = code.match(/(?:room=)?([a-z0-9]{6,24})\s*$/);
  if (!m) return null;
  let v;
  try { v = [...m[1]].reduce((acc, ch) => acc * 36n + BigInt(parseInt(ch, 36)), 0n); } catch (e) { return null; }
  const take = bits => { const x = Number(v & ((1n << BigInt(bits)) - 1n)); v >>= BigInt(bits); return x; };
  const tries = TRY_OPTS[take(2)];
  const diff = DIFF_IDS[take(3)] || 'medium';
  const famous = !!take(1);
  const moods = unmask(take(2), ROOM_MOODS);
  const eras = unmask(take(5), ROOM_ERAS);
  const langs = unmask(take(3), ROOM_LANGS);
  const cats = unmask(take(4), ROOM_CATS);
  const seed = Number(v);
  if (v > 0x3fffffffn) return null;
  return { code: m[1], seed, cats, langs, eras, moods, famous, diff, tries };
}

export function todayKey() {
  // the daily challenge rolls over at midnight India time
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).replace(/-/g, '');
}
export function dailyConfig(day = todayKey()) {
  return {
    code: day, seed: hashStr('bollyspot-daily-' + day),
    cats: new Set(ROOM_CATS), langs: new Set(), eras: new Set(), moods: new Set(),
    famous: true, diff: 'medium', tries: 5,
  };
}
export function prettyDay(day) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
