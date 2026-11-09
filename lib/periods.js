// Trending periods roll over on India time. Keys are shared by the trending feed and the score API.
function istDate(ms = Date.now()) { return new Date(ms + 5.5 * 3600 * 1000); }
const pad = n => String(n).padStart(2, '0');

function dayKey(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()); }
function monthKey(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1); }
function weekKey(d) {
  // ISO-8601 week: the week with the year's first Thursday is week 1
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + pad(week);
}

function currentPeriods(ms = Date.now()) {
  const d = istDate(ms);
  return { d: dayKey(d), w: weekKey(d), m: monthKey(d) };
}

// a score may land in the current period or the one just before (late finishers)
function trendBoardAllowed(board, ms = Date.now()) {
  const m = /^trend:(d|w|m):(\d{6,8})$/.exec(board);
  if (!m) return false;
  const span = { d: 86400000, w: 7 * 86400000, m: 31 * 86400000 }[m[1]];
  return [0, -1].some(k => currentPeriods(ms + k * span)[m[1]] === m[2]);
}

module.exports = { currentPeriods, trendBoardAllowed };
