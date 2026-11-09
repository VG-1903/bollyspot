// Player identity (no sign-up: a random id + chosen name, kept on this device)
// and the global leaderboard API.
const KEY = 'bollyspot_player';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}
let me = load();
if (!me || !/^[a-z0-9]{8,32}$/.test(me.id || '')) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
  me = { id, name: '' };
  try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {}
}

export const player = () => me;
export function setName(name) {
  me.name = String(name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {}
  return me.name;
}

async function call(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (r.status === 404) return { configured: false, offline: true, entries: [] };
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { configured: true, error: j.error || ('http ' + r.status), entries: [] };
    return j;
  } catch (e) {
    return { configured: false, offline: true, entries: [] };
  }
}

export function getBoard(board) {
  return call(`/api/scores?board=${encodeURIComponent(board)}&playerId=${me.id}`);
}

export function submitScore(board, score) {
  return call('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, playerId: me.id, name: me.name, score }),
  });
}
