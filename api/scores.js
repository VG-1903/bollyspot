// Global leaderboards.
//   GET  /api/scores?board=<board>&playerId=<id>   -> top 25 (+ your rank)
//   POST /api/scores {board, playerId, name, score} -> keeps each player's best
// Boards: "survival" (best streak), "daily:YYYYMMDD" (daily challenge points),
//         "room:<code>" (friends' room points).
const { configured, pipeline } = require('../lib/redis');

const BOARD_RX = /^(survival|daily:\d{8}|room:[a-z0-9]{6,24})$/;
const PLAYER_RX = /^[a-z0-9]{8,32}$/;
const TOP = 25;
const KEEP_SECONDS = 60 * 60 * 24 * 45;
const MAX_SCORE = { survival: 5000, daily: 5000, room: 5000 };
const POSTS_PER_MINUTE = 20;

function boardKind(board) { return board.split(':')[0]; }
function cleanName(name) {
  return String(name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
function dailyAllowed(board) {
  // only today's daily (any timezone) accepts scores
  const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const now = Date.now();
  const ok = [-1, 0, 1].map(o => 'daily:' + ymd(new Date(now + o * 86400000)));
  return ok.includes(board);
}

async function readBoard(board, playerId) {
  const key = 'lb:' + board;
  const cmds = [['ZRANGE', key, 0, TOP - 1, 'REV', 'WITHSCORES'], ['ZCARD', key]];
  if (playerId) cmds.push(['ZREVRANK', key, playerId], ['ZSCORE', key, playerId]);
  const [flat, total, rank, mine] = await pipeline(cmds);
  const ids = [], scores = [];
  for (let i = 0; i < flat.length; i += 2) { ids.push(flat[i]); scores.push(Number(flat[i + 1])); }
  const names = ids.length ? (await pipeline([['HMGET', 'players', ...ids]]))[0] : [];
  return {
    configured: true,
    board,
    total,
    entries: ids.map((id, i) => ({ name: names[i] || 'Player', score: scores[i], you: id === playerId })),
    you: playerId && rank !== null && rank !== undefined ? { rank: rank + 1, score: Number(mine) } : null,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured()) return res.status(200).json({ configured: false, entries: [] });

  try {
    if (req.method === 'GET') {
      const board = String(req.query.board || '');
      const playerId = PLAYER_RX.test(String(req.query.playerId || '')) ? String(req.query.playerId) : null;
      if (!BOARD_RX.test(board)) return res.status(400).json({ error: 'bad board' });
      return res.status(200).json(await readBoard(board, playerId));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const board = String(body.board || '');
      const playerId = String(body.playerId || '');
      const name = cleanName(body.name);
      const score = Math.floor(Number(body.score));
      if (!BOARD_RX.test(board)) return res.status(400).json({ error: 'bad board' });
      if (!PLAYER_RX.test(playerId)) return res.status(400).json({ error: 'bad player' });
      if (!name) return res.status(400).json({ error: 'name required' });
      if (!Number.isFinite(score) || score < 1 || score > MAX_SCORE[boardKind(board)]) {
        return res.status(400).json({ error: 'bad score' });
      }
      if (boardKind(board) === 'daily' && !dailyAllowed(board)) {
        return res.status(400).json({ error: 'daily closed' });
      }

      const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
      const rlKey = 'rl:' + ip + ':' + Math.floor(Date.now() / 60000);
      const key = 'lb:' + board;
      const [hits] = await pipeline([['INCR', rlKey], ['EXPIRE', rlKey, 120]]);
      if (hits > POSTS_PER_MINUTE) return res.status(429).json({ error: 'slow down' });
      await pipeline([
        ['ZADD', key, 'GT', score, playerId], ['EXPIRE', key, KEEP_SECONDS],
        ['HSET', 'players', playerId, name],
      ]);
      return res.status(200).json(await readBoard(board, playerId));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'storage error', detail: String(e.message || e).slice(0, 120) });
  }
};
