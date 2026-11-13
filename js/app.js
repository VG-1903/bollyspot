import { loadCatalog, previewUrl, artUrl, prepare } from './data.js';
import { search, highlight, closeEnough, norm } from './search.js';
import { player, setName, getBoard, submitScore, getTrending } from './api.js';
import { sfx as playSfx } from './sfx.js';
import { ROUNDS, ROOM_CATS, encodeRoom, decodeRoom, dailyConfig, todayKey, prettyDay, seededPick, hashStr } from './challenge.js';
import { loadMySongs, initImporter } from './importer.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PREVIEW = 30;
const RING = 2 * Math.PI * 54;

/* ------------------------------------------------------------------ config */
const MODES = [
  { id: 'classic', label: '🎮 Classic', sub: 'endless' },
  { id: 'trend', label: '🔥 Trending', sub: 'fresh every day' },
  { id: 'survival', label: '💀 Survival', sub: '1 miss = out' },
  { id: 'daily', label: '📅 Daily', sub: 'same 10 for all' },
  { id: 'room', label: '🏠 Friends', sub: 'share a room' },
  { id: 'party', label: '🎉 Party', sub: 'teams, 1 device' },
];
const GROUPS = {
  cats: { any: 'All catalogs', opts: [['b', '🎬 Bollywood'], ['h', '🎸 Hollywood'], ['i', '🎤 Indie'], ['p', '🥁 Punjabi'], ['my', '💚 My songs']] },
  langs: { any: 'Any language', opts: [['hi', 'Hindi'], ['en', 'English'], ['pa', 'Punjabi']] },
  eras: { any: 'Any era', opts: [['classic', 'Classic ≤1989'], ['90s', '90s'], ['2000s', '2000s'], ['2010s', '2010s'], ['2020s', '2020s']] },
  moods: { any: 'Any mood', opts: [['p', '⚡ Peppy'], ['s', '💔 Sad']] },
};
const DIFFS = [
  { id: 'easy', label: 'Easy', len: 3, pts: 10 },
  { id: 'medium', label: 'Medium', len: 1, pts: 25 },
  { id: 'hard', label: 'Hard', len: 0.5, pts: 50 },
  { id: 'expert', label: 'Expert', len: 0.25, pts: 100 },
  { id: 'imp', label: 'Insane', len: 0.1, pts: 250 },
];
const TRIES = [3, 4, 5, 6];
const TEAMS = [2, 3, 4];
const ROUNDS_OPTS = [3, 5, 10, 0];
const TIMERS = [0, 30, 60, 90];

/* ------------------------------------------------------------------ state */
const S = {
  songs: [],
  mode: 'classic',
  f: { cats: new Set(), langs: new Set(), eras: new Set(), moods: new Set(), famous: true, artist: '' },
  diff: 'easy', maxTries: 5, timer: 0, teamsN: 2, rounds: 5,
  teams: [], turn: 0, roundTeam: 0, teamRounds: [], passed: new Set(),
  current: null, tries: 0, roundOver: true, offset: 0, played: new Set(),
  score: 0, streak: 0, best: 0,
  prefs: { spot: 'gold', fromStart: false, volume: 90, sfx: true },
  challenge: null, saved: null, lastRoom: null, relaxNote: '',
  pendingAfterName: null,
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
function loadState() {
  const s = store.get('bollyspot', {});
  S.score = s.score || 0; S.streak = s.streak || 0; S.best = s.best || 0;
  if (s.prefs) Object.assign(S.prefs, s.prefs);
  const c = store.get('bollyspot_cfg', null);
  if (c) {
    for (const g of Object.keys(GROUPS)) S.f[g] = new Set((c[g] || []).filter(v => GROUPS[g].opts.some(o => o[0] === v)));
    S.f.famous = c.famous !== false;
    S.diff = DIFFS.some(d => d.id === c.diff) ? c.diff : 'easy';
    S.maxTries = TRIES.includes(c.tries) ? c.tries : 5;
    S.timer = TIMERS.includes(c.timer) ? c.timer : 0;
    S.teamsN = TEAMS.includes(c.teamsN) ? c.teamsN : 2;
    S.rounds = ROUNDS_OPTS.includes(c.rounds) ? c.rounds : 5;
    if (['classic', 'survival', 'party'].includes(c.mode)) S.mode = c.mode;
  }
  S.lastRoom = store.get('bollyspot_lastroom', null);
}
function save() {
  store.set('bollyspot', { score: S.score, streak: S.streak, best: S.best, prefs: S.prefs });
  if (S.challenge) return;
  store.set('bollyspot_cfg', {
    cats: [...S.f.cats], langs: [...S.f.langs], eras: [...S.f.eras], moods: [...S.f.moods], famous: S.f.famous,
    diff: S.diff, tries: S.maxTries, timer: S.timer, teamsN: S.teamsN, rounds: S.rounds, mode: S.mode,
  });
}
const diffObj = () => DIFFS.find(d => d.id === S.diff) || DIFFS[0];

/* ------------------------------------------------------------------ pool */
function matches(s, f, relax) {
  if (f.artist) return s.al.includes(f.artist.toLowerCase());
  if (f.cats.size ? !f.cats.has(s.c) : s.c === 'my') return false;
  if (f.langs.size && !f.langs.has(s.l)) return false;
  if (relax < 3 && f.eras.size && !f.eras.has(s.era)) return false;
  if (relax < 2 && f.moods.size && !f.moods.has(s.mood)) return false;
  if (relax < 1 && f.famous && !s.f) return false;
  return true;
}
const RELAX_NOTES = ['', 'not enough famous songs — deep cuts included', 'not enough for that mood — mood ignored', 'not enough for that era — era ignored'];
function poolFor(f, songs, need = 5) {
  for (let relax = 0; relax <= 3; relax++) {
    const p = songs.filter(s => matches(s, f, relax));
    if (p.length >= need || (relax === 3 && p.length)) return { pool: p, relax };
  }
  return { pool: songs.filter(s => s.c !== 'my'), relax: 4 };
}
function activePool() {
  const need = S.f.cats.size === 1 && S.f.cats.has('my') ? 1 : 5;
  return poolFor(S.f, S.songs, need);
}
function searchScope() {
  if (S.challenge) return S.songs.filter(s => s.c !== 'my').concat(S.trendSongs || []);
  if (S.f.artist) return S.songs;
  return S.songs.filter(s => (S.f.cats.size ? S.f.cats.has(s.c) : s.c !== 'my') && (!S.f.langs.size || S.f.langs.has(s.l)));
}

/* ------------------------------------------------------------------ ui helpers */
function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2300);
  setTimeout(() => t.remove(), 2650);
}
function sfx(kind) { if (S.prefs.sfx) playSfx(kind, S.prefs.volume / 100); }
function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }
document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) { closeModal(close.closest('.modal').id); return; }
  if (e.target.classList.contains('modal') && e.target.id !== 'revealModal') closeModal(e.target.id);
});
const fmt = v => (+v.toFixed(2)) + 's';
const snipSecs = (t = S.tries) => Math.min(12, diffObj().len * Math.pow(2, t));
const potential = () => Math.max(5, Math.round(diffObj().pts * Math.pow(0.6, S.tries)));

/* ------------------------------------------------------------------ render */
function renderModes() {
  $('modes').innerHTML = MODES.map(m =>
    `<button class="mode ${S.mode === m.id ? 'active' : ''}" data-mode="${m.id}">${m.label}<small>${m.sub}</small></button>`).join('');
}
function segRow(group, items, current, labelFn) {
  document.querySelectorAll(`[data-group="${group}"]`).forEach(el => {
    el.innerHTML = items.map(v => {
      const id = typeof v === 'object' ? v.id : v;
      return `<button class="${id === current ? 'on' : ''}" data-v="${id}">${labelFn(v)}</button>`;
    }).join('');
  });
}
function renderFilters() {
  for (const [g, def] of Object.entries(GROUPS)) {
    const set = S.f[g];
    document.querySelector(`[data-group="${g}"]`).innerHTML =
      `<button class="chip any ${set.size ? '' : 'on'}" data-v="">${def.any}</button>` +
      def.opts.map(([v, label]) => `<button class="chip ${set.has(v) ? 'on' : ''}" data-v="${v}">${label}</button>`).join('');
  }
  document.querySelector('[data-group="fame"]').innerHTML =
    `<button class="chip ${S.f.famous ? 'on' : ''}" data-v="1">🔥 Famous hits only</button>` +
    `<button class="chip ${S.f.famous ? '' : 'on'}" data-v="0">Include deep cuts</button>`;
  segRow('diff', DIFFS, S.diff, d => `${d.label} · ${fmt(d.len)}`);
  segRow('tries', TRIES, S.maxTries, v => v);
  segRow('teams', TEAMS, S.teamsN, v => v + ' teams');
  segRow('rounds', ROUNDS_OPTS, S.rounds, v => (v ? v : '∞'));
  segRow('timer', TIMERS, S.timer, v => (v ? v + 's' : 'Off'));
  $('partySettings').hidden = S.mode !== 'party';
  // choosing an artist overrides the other song filters
  const artistOn = !!S.f.artist;
  ['cats', 'langs', 'eras', 'moods', 'fame'].forEach(g => {
    document.querySelector(`[data-group="${g}"]`).closest('.fgroup').hidden = artistOn;
  });
  $('artistInput').value = S.f.artist;
  $('artistClear').hidden = !artistOn;
  $('filtersCard').classList.toggle('locked', !!S.challenge);
  renderSummary();
}
function renderSummary() {
  const tags = [];
  const label = (g, v) => GROUPS[g].opts.find(o => o[0] === v)[1];
  if (S.challenge) {
    tags.push(`<span class="tag on">🔒 Challenge settings</span>`);
  } else if (S.f.artist) {
    tags.push(`<span class="tag on">🎙 ${esc(S.f.artist)}</span>`);
  } else {
    for (const g of Object.keys(GROUPS)) {
      const set = S.f[g];
      tags.push(set.size ? `<span class="tag on">${[...set].map(v => label(g, v)).join(' + ')}</span>` : `<span class="tag">${GROUPS[g].any}</span>`);
    }
    tags.push(`<span class="tag ${S.f.famous ? 'on' : ''}">${S.f.famous ? '🔥 Famous' : 'All songs'}</span>`);
  }
  tags.push(`<span class="tag on">${diffObj().label} · ${S.maxTries} tries</span>`);
  $('filtersSummary').innerHTML = tags.join('');
  const { pool, relax } = S.challenge ? { pool: S.challenge.seq, relax: 0 } : activePool();
  $('poolCount').textContent = pool.length.toLocaleString('en-IN');
  S.relaxNote = RELAX_NOTES[relax] || '';
}
function setStat(id, value) {
  const el = $(id), v = String(value);
  if (el.textContent === v) return;
  const grew = Number(v) > Number(el.textContent);
  el.textContent = v;
  if (grew) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function renderStats() {
  setStat('score', S.challenge ? S.challenge.points : S.score);
  setStat('streak', S.streak);
  setStat('best', S.best);
  $('streak').parentElement.classList.toggle('hot', S.streak >= 3);
  $('worth').textContent = S.roundOver ? '–' : potential();
  document.querySelector('#score').previousElementSibling.textContent = S.challenge ? 'Points' : 'Score';
}
function renderTeams() {
  $('teambar').innerHTML = S.mode === 'party' ? S.teams.map((t, i) =>
    `<button class="team ${i === S.turn ? 'turn' : ''}" data-team="${i}" title="Rename">${i === S.turn ? '▶ ' : ''}${esc(t.name)}<b>${t.score}</b></button>`).join('') : '';
  $('passBtn').hidden = !(S.mode === 'party' && S.teams.length > 1);
}
function renderChallengeBar() {
  const ch = S.challenge;
  $('challengeBar').hidden = !ch;
  if (!ch) return;
  const unranked = ch.ranked ? '' : ' · replay (unranked)';
  const sp = ch.cfg.sponsor;
  const title = ch.kind === 'daily'
    ? `📅 <b>Daily challenge</b> · ${prettyDay(ch.cfg.code)}${unranked}`
    : ch.kind === 'trend'
      ? `🔥 <b>${esc(ch.cfg.label)}</b>${unranked}${sp ? ` · <span class="sp-tag">presented by</span> <a href="${esc(sp.url)}" target="_blank" rel="noopener sponsored" style="color:var(--text);font-weight:800">${esc(sp.name)}</a>` : ''}`
      : `🏠 <b>Room ${esc(ch.cfg.code)}</b> · ${DIFFS.find(d => d.id === ch.cfg.diff).label}, ${ch.cfg.tries} tries`;
  const bars = Array.from({ length: ROUNDS }, (_, i) =>
    `<i class="${i < ch.results.length ? (ch.results[i] ? 'win' : 'loss') : i === ch.round ? 'now' : ''}"></i>`).join('');
  $('challengeBar').innerHTML =
    `<div class="grow"><div>${title} · round ${Math.min(ch.round + 1, ROUNDS)}/${ROUNDS}</div><div class="rounds">${bars}</div></div>` +
    (ch.kind === 'room' ? `<button class="ghostbtn" id="copyRoom">🔗 Copy link</button>` : '') +
    `<button class="ghostbtn" id="leaveChallenge">Leave</button>`;
  $('leaveChallenge').onclick = () => { leaveChallenge(); setMode('classic'); };
  if ($('copyRoom')) $('copyRoom').onclick = () => copyText(roomUrl(ch.cfg.code), 'Room link copied — send it to friends!');
}
function renderRound() {
  $('clipLen').textContent = fmt(snipSecs());
  $('attempts').innerHTML = Array.from({ length: S.maxTries }, (_, i) =>
    `<div class="dot ${i < S.tries ? 'used' : i === S.tries ? 'current' : ''}"></div>`).join('');
  const tl = $('timeline');
  tl.querySelectorAll('.tl-tick').forEach(el => el.remove());
  for (let i = S.tries + 1; i < S.maxTries; i++) {
    const tick = document.createElement('div');
    tick.className = 'tl-tick';
    tick.style.left = (snipSecs(i) / PREVIEW * 100) + '%';
    tl.appendChild(tick);
  }
  $('tlFill').style.width = (snipSecs() / PREVIEW * 100) + '%';
  renderStats();
}
function renderPlayer() {
  const p = player();
  $('playerName').textContent = p.name || 'Set name';
  $('playerAvatar').textContent = (p.name || '?').slice(0, 1).toUpperCase();
}
function renderAll() {
  document.body.dataset.spot = S.prefs.spot;
  renderModes(); renderFilters(); renderTeams(); renderChallengeBar(); renderRound(); renderPlayer();
}

/* ------------------------------------------------------------------ audio */
const audio = new Audio();
audio.preload = 'auto';
let stopTimer = null, raf = null;
function setPlaying(on) {
  $('playIcon').innerHTML = on ? '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>' : '<path d="M8 5v14l11-7z"/>';
  $('playBtn').classList.toggle('playing', on);
}
function stopAudio() {
  audio.pause();
  clearTimeout(stopTimer); stopTimer = null;
  cancelAnimationFrame(raf); raf = null;
  $('tlCursor').style.opacity = 0;
  $('ringFg').style.strokeDashoffset = RING;
  setPlaying(false);
}
function playClip() {
  if (S.roundOver) return;
  stopAudio();
  $('playBtn').classList.remove('pulse');
  const len = snipSecs();
  audio.currentTime = S.offset;
  audio.volume = S.prefs.volume / 100;
  audio.play().then(() => {
    startTimer();
    setPlaying(true);
    $('clipHint').textContent = 'listening…';
    const t0 = performance.now();
    $('tlCursor').style.opacity = 1;
    const tick = () => {
      const el = Math.min(len, (performance.now() - t0) / 1000);
      $('tlCursor').style.left = (el / PREVIEW * 100) + '%';
      $('ringFg').style.strokeDashoffset = RING * (1 - el / len);
      if (el < len) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    stopTimer = setTimeout(() => { stopAudio(); $('clipHint').textContent = 'tap to replay'; }, len * 1000);
  }).catch(() => toast('Could not load audio — check your connection', 'bad'));
}
function playFull() {
  stopAudio();
  audio.currentTime = 0;
  audio.volume = S.prefs.volume / 100;
  audio.play().then(() => setPlaying(true)).catch(() => {});
  audio.onended = () => setPlaying(false);
}

/* ------------------------------------------------------------------ timer */
let timerInt = null, timerLeft = 0;
function stopTimerClock() { clearInterval(timerInt); timerInt = null; $('timerStat').hidden = true; }
function startTimer() {
  if (!S.timer || timerInt || S.roundOver) return;
  timerLeft = S.timer;
  $('timerStat').hidden = false;
  $('timer').textContent = timerLeft;
  $('timer').classList.remove('low');
  timerInt = setInterval(() => {
    timerLeft--;
    $('timer').textContent = Math.max(0, timerLeft);
    $('timer').classList.toggle('low', timerLeft <= 10);
    if (timerLeft <= 0) { stopTimerClock(); toast('⏰ Time up!', 'bad'); endRound(false); }
  }, 1000);
}

/* ------------------------------------------------------------------ rounds */
function newRound() {
  stopAudio(); stopTimerClock(); closeSuggest();
  closeModal('revealModal');
  const ch = S.challenge;
  if (ch) {
    if (ch.round >= ROUNDS) { finishChallenge(); return; }
    S.current = ch.seq[ch.round];
    S.offset = S.prefs.fromStart ? 0 : 4 + (hashStr(ch.cfg.code + ':' + ch.round) % 1300) / 100;
  } else {
    const { pool } = activePool();
    let candidates = pool.filter(s => !S.played.has(s.key));
    if (!candidates.length) { S.played.clear(); candidates = pool; }
    S.current = candidates[Math.floor(Math.random() * candidates.length)];
    S.played.add(S.current.key);
    S.offset = S.prefs.fromStart ? 0 : 4 + Math.random() * (PREVIEW - 17);
    if (S.relaxNote) toast('Heads up: ' + S.relaxNote);
  }
  S.tries = 0; S.roundOver = false;
  S.roundTeam = S.turn; S.passed = new Set();
  audio.src = previewUrl(S.current);
  $('guess').value = ''; $('clearQ').hidden = true;
  $('guessArea').hidden = false;
  $('clipHint').textContent = 'tap to play';
  $('msg').textContent = S.mode === 'party' && S.teams.length ? `${S.teams[S.turn].name}, you're up — hit play` : '';
  $('playBtn').classList.add('pulse');
  renderRound(); renderTeams(); renderChallengeBar();
}

function useTry(reason, kind) {
  S.tries++;
  sfx(kind === 'bad' ? 'bad' : 'hint');
  if (S.tries >= S.maxTries) { endRound(false); return; }
  renderRound();
  toast(`${reason} — clip is now ${fmt(snipSecs())}`, kind);
  $('guessArea').classList.add('shake');
  setTimeout(() => $('guessArea').classList.remove('shake'), 400);
}

function submitGuess(song) {
  if (S.roundOver || !S.current) return;
  const typed = $('guess').value;
  // the same song can sit in the catalog and in the live charts under different categories
  const lead = s => norm(s.a.split(/,|&/)[0]);
  const ok = song
    ? song.k === S.current.k && (song.c === S.current.c || lead(song) === lead(S.current))
    : closeEnough(typed, S.current);
  if (ok) { endRound(true); return; }
  $('guess').value = ''; $('clearQ').hidden = true;
  closeSuggest();
  if (S.mode === 'survival') { endRound(false, true); return; }
  if (!S.challenge) {
    const penalty = Math.max(2, Math.round(diffObj().pts * 0.1));
    S.score = Math.max(0, S.score - penalty);
    if (S.mode === 'party' && S.teams.length) S.teams[S.turn].score = Math.max(0, S.teams[S.turn].score - penalty);
    renderTeams();
    useTry(`❌ Wrong (−${penalty})`, 'bad');
  } else useTry('❌ Wrong', 'bad');
}

function endRound(won, survivalMiss = false) {
  if (S.roundOver) return;
  S.roundOver = true;
  stopAudio(); stopTimerClock(); closeSuggest();
  const ch = S.challenge;
  let gained = 0;
  if (won) {
    gained = potential();
    S.streak++;
    if (S.streak > S.best) S.best = S.streak;
    if (ch) ch.points += gained; else S.score += gained;
    if (S.mode === 'party' && S.teams.length) S.teams[S.turn].score += gained;
    sfx('good');
    toast(`✅ Correct! +${gained}${S.mode === 'party' && S.teams.length ? ' for ' + S.teams[S.turn].name : ''}`, 'good');
  } else {
    if (S.mode === 'survival') {
      if (S.streak > 0) {
        addHistory('💀 Survival run', S.streak, 'streak');
        const run = S.streak;
        requireName(() => submitScore('survival', run).then(r => {
          if (r && r.configured && r.you) toast(`🌍 Survival: you're #${r.you.rank} worldwide`, 'good');
        }));
        toast(`💀 ${survivalMiss ? 'Wrong — ' : ''}run over after ${run} song${run === 1 ? '' : 's'}`, 'bad');
      } else toast(survivalMiss ? '💀 Wrong — run over!' : `❌ It was “${S.current.t}”`, 'bad');
    } else toast(`❌ It was “${S.current.t}”`, 'bad');
    S.streak = 0;
    sfx('bad');
  }
  if (ch) { ch.results.push(won); ch.round++; }
  save(); renderStats(); renderTeams(); renderChallengeBar();
  if (S.mode === 'party' && S.teams.length) {
    if (S.teamRounds.length !== S.teams.length) S.teamRounds = S.teams.map(() => 0);
    S.teamRounds[S.roundTeam]++;
    S.turn = (S.roundTeam + 1) % S.teams.length;
    renderTeams();
    if (S.rounds > 0 && S.teamRounds.every(r => r >= S.rounds)) setTimeout(partyOver, 500);
  }
  showReveal(won, gained);
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const css = getComputedStyle(document.body);
  const colors = [css.getPropertyValue('--a1'), css.getPropertyValue('--a2'), '#ffffff', '#3ddc84'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = (Math.random() * 100) + '%';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--x', (Math.random() * 240 - 120) + 'px');
    p.style.setProperty('--r', (Math.random() * 1080 - 540) + 'deg');
    p.style.setProperty('--d', (1.3 + Math.random() * 1.3) + 's');
    p.style.setProperty('--w', (Math.random() * 0.35) + 's');
    if (i % 3 === 0) { p.style.borderRadius = '50%'; p.style.height = '9px'; }
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}

function showReveal(won, gained) {
  const s = S.current;
  $('verdict').textContent = won ? `Correct · +${gained}` : 'The song was';
  $('verdict').className = 'verdict ' + (won ? 'good' : 'bad');
  $('rArt').src = artUrl(s, 300);
  $('rBg').style.backgroundImage = s.i ? `url("${artUrl(s, 100)}")` : 'none';
  $('revealSheet').classList.toggle('won', won);
  if (won) confetti();
  $('rTitle').textContent = s.t;
  $('rMeta').textContent = [s.m, s.a, s.y || ''].filter(Boolean).join(' · ');
  const ch = S.challenge;
  $('nextBtn').textContent = ch && ch.round >= ROUNDS ? 'See results →' : 'Next song →';
  openModal('revealModal');
  setTimeout(() => $('nextBtn').focus(), 50);
}

/* ------------------------------------------------------------------ search dropdown */
let sugItems = [], sel = -1, sugTimer = null;
function closeSuggest() { $('suggest').classList.remove('open'); sugItems = []; sel = -1; }
function renderSuggest() {
  const q = $('guess').value;
  $('clearQ').hidden = !q;
  sugItems = search(q, searchScope(), 8);
  sel = sugItems.length ? 0 : -1;
  if (q.trim().length < 2) { closeSuggest(); return; }
  $('suggest').innerHTML = sugItems.length
    ? '<div class="sug-head">Songs</div>' + sugItems.map((s, i) => {
        const sub = [s.a, s.m, s.y || ''].filter(Boolean).join(' · ');
        const art = s.i ? `<img loading="lazy" src="${artUrl(s, 100)}" alt="">` : '<div class="noart"></div>';
        return `<div class="sug ${i === sel ? 'sel' : ''}" data-i="${i}" role="option">${art}<div class="txt"><div class="t">${highlight(s.t, q)}</div><div class="s">${esc(sub)}</div></div></div>`;
      }).join('')
    : '<div class="sug-empty">No matching songs — try another spelling or part of the lyrics in the title</div>';
  $('suggest').classList.add('open');
}
function moveSel(d) {
  if (!sugItems.length) return;
  sel = (sel + d + sugItems.length) % sugItems.length;
  document.querySelectorAll('.sug').forEach((el, i) => el.classList.toggle('sel', i === sel));
  document.querySelector('.sug.sel')?.scrollIntoView({ block: 'nearest' });
}
$('guess').addEventListener('input', () => { clearTimeout(sugTimer); sugTimer = setTimeout(renderSuggest, 40); });
$('guess').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(sugTimer);
    if (!$('suggest').classList.contains('open') && $('guess').value.trim().length >= 2) renderSuggest();
    if (sugItems.length && sel >= 0) submitGuess(sugItems[sel]);
    else if ($('guess').value.trim()) submitGuess(null);
  } else if (e.key === 'Escape') closeSuggest();
});
$('guess').addEventListener('focus', () => { if ($('guess').value.trim().length >= 2) renderSuggest(); });
$('suggest').addEventListener('mousedown', e => {
  const el = e.target.closest('.sug');
  if (el) { e.preventDefault(); submitGuess(sugItems[+el.dataset.i]); }
});
$('clearQ').onclick = () => { $('guess').value = ''; $('clearQ').hidden = true; closeSuggest(); $('guess').focus(); };
document.addEventListener('click', e => { if (!e.target.closest('.searchbox')) closeSuggest(); });

/* ------------------------------------------------------------------ modes */
function setMode(id) {
  if (id === 'daily') { startChallenge('daily', dailyConfig()); return; }
  if (id === 'room') { openModal('roomModal'); return; }
  if (id === 'trend') { openTrending(); return; }
  if (S.challenge) leaveChallenge();
  S.mode = id;
  if (id === 'party') {
    S.teams = Array.from({ length: S.teamsN }, (_, i) => ({ name: 'Team ' + (i + 1), score: 0 }));
    S.turn = 0; S.teamRounds = S.teams.map(() => 0);
    toast(`🎉 ${S.teamsN} teams — pass the phone each round`);
  } else S.teams = [];
  if (id === 'survival') { S.streak = 0; toast('💀 Survival — one miss ends the run'); }
  save(); renderAll(); newRound();
}
$('modes').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]');
  if (b) setMode(b.dataset.mode);
});

/* ------------------------------------------------------------------ challenges */
function roomUrl(code) { return location.origin + '/?room=' + code; }
function challengeSeq(cfg) {
  const catalog = S.songs.filter(s => s.c !== 'my');
  const f = { cats: cfg.cats.size ? cfg.cats : new Set(ROOM_CATS), langs: cfg.langs, eras: cfg.eras, moods: cfg.moods, famous: cfg.famous, artist: '' };
  return seededPick(poolFor(f, catalog, ROUNDS).pool, cfg.seed, ROUNDS);
}
function startChallenge(kind, cfg) {
  const seq = cfg.seq || challengeSeq(cfg);
  if (seq.length < ROUNDS) { toast('Not enough songs for that challenge', 'bad'); return; }
  if (!S.challenge) S.saved = { diff: S.diff, maxTries: S.maxTries, mode: S.mode };
  const board = kind === 'daily' ? 'daily:' + cfg.code : kind === 'trend' ? cfg.board : 'room:' + cfg.code;
  const done = store.get('bollyspot_done', {});
  S.challenge = {
    kind, cfg, seq, round: 0, results: [], points: 0, board,
    ranked: kind === 'room' || done[board] === undefined,
  };
  if (kind === 'trend') { S.lastTrend = { board, label: cfg.label }; closeModal('trendModal'); }
  S.mode = kind; S.diff = cfg.diff; S.maxTries = cfg.tries; S.teams = [];
  if (kind === 'room') {
    S.lastRoom = cfg.code; store.set('bollyspot_lastroom', cfg.code);
    history.replaceState({}, '', '/?room=' + cfg.code);
  }
  if (!S.challenge.ranked) toast(`You already played this one (${done[board]} pts) — this replay won't count`);
  closeModal('roomModal');
  renderAll(); newRound();
}
/* ------------------------------------------------------------------ trending */
const PERIODS = [
  { id: 'd', emoji: '📈', title: "Today's charts", sub: 'What India and the world are playing right now' },
  { id: 'w', emoji: '🆕', title: "This week's new drops", sub: 'Fresh releases from the last few weeks' },
  { id: 'm', emoji: '🏆', title: "This month's biggest hits", sub: 'The month so far — monthly leaderboard' },
];
function periodLabel(p, key) {
  if (p === 'd') return "Today's charts · " + prettyDay(key);
  if (p === 'w') return "This week's drops";
  return new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, 1)).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' }) + ' hits';
}
async function openTrending() {
  openModal('trendModal');
  const data = await getTrending();
  if (!data || !data.songs) {
    $('trendCards').innerHTML = '<div class="lbnote">Couldn\'t reach the charts right now — try again in a minute.</div>';
    return;
  }
  S.trendSongs = data.songs.map(s => prepare({ ...s }));
  const prepared = new Map(S.trendSongs.map(s => [s.id, s]));
  const sp = data.sponsor;
  $('sponsorBanner').innerHTML = sp && sp.periods.length
    ? `<div class="sponsor" style="--sp:${esc(sp.color || '#ff4da6')}"><span class="sp-tag">Presented by</span><a href="${esc(sp.url)}" target="_blank" rel="noopener sponsored">${esc(sp.name)}</a><span>${esc(sp.headline || '')}</span></div>`
    : '';
  const done = store.get('bollyspot_done', {});
  $('trendCards').innerHTML = PERIODS.map(p => {
    const board = `trend:${p.id}:${data.periods[p.id]}`;
    const played = done[board];
    const sponsored = sp && sp.periods.includes(p.id) ? ` · <b style="display:inline;color:var(--a1)">sponsored by ${esc(sp.name)}</b>` : '';
    return `<button class="trend-card" data-period="${p.id}"><span class="emoji">${p.emoji}</span><span class="grow"><b>${p.title}</b><small>${p.sub}${sponsored}</small></span>${played !== undefined ? `<span class="done">✓ ${played} pts</span>` : '<span class="go">Play 10 →</span>'}</button>`;
  }).join('');
  $('trendCards').onclick = e => {
    const card = e.target.closest('[data-period]');
    if (!card) return;
    const p = card.dataset.period, key = data.periods[p];
    const seq = data.picks[p].map(id => prepared.get(id)).filter(Boolean);
    startChallenge('trend', {
      code: key, period: p, seq, diff: 'medium', tries: 5,
      board: `trend:${p}:${key}`, label: periodLabel(p, key),
      sponsor: sp && sp.periods.includes(p) ? sp : null,
    });
  };
}

function leaveChallenge() {
  if (!S.challenge) return;
  if (S.saved) { S.diff = S.saved.diff; S.maxTries = S.saved.maxTries; }
  S.challenge = null; S.saved = null;
  if (location.search.includes('room=')) history.replaceState({}, '', '/');
}
async function finishChallenge() {
  const ch = S.challenge;
  closeModal('revealModal');
  const squares = ch.results.map(r => (r ? '🟩' : '🟥')).join('');
  const label = ch.kind === 'daily' ? `Daily · ${prettyDay(ch.cfg.code)}` : ch.kind === 'trend' ? ch.cfg.label : `Room ${ch.cfg.code}`;
  const shareText = `BollySpot ${label} — ${ch.points} pts\n${squares}\n${ch.kind === 'room' ? roomUrl(ch.cfg.code) : location.origin}`;
  addHistory({ daily: '📅 ', trend: '🔥 ', room: '🏠 ' }[ch.kind] + label, ch.points, 'pts');
  sfx('win');
  // the challenge is over: carry on in Classic behind the results sheet
  leaveChallenge();
  S.mode = 'classic';
  renderAll(); newRound();
  const extra = `<div class="result-big">${label}<b>${ch.points} pts</b><div>${squares}</div></div>
    <div class="row-actions"><button class="btn" id="shareRes">📤 Share result</button><button class="btn primary" id="playOn">Keep playing</button></div>`;
  const shown = openBoards(ch.kind, { title: '🏁 Challenge complete', extra, roomCode: ch.kind === 'room' ? ch.cfg.code : null });
  $('shareRes').onclick = () => {
    if (navigator.share) navigator.share({ text: shareText }).catch(() => {});
    else copyText(shareText, 'Result copied — paste it anywhere!');
  };
  $('playOn').onclick = () => closeModal('lbModal');
  await shown;
  const submit = () => submitScore(ch.board, Math.max(1, ch.points)).then(r => { if (r && r.configured && boardTab !== 'local') renderBoardData(r); });
  if (ch.ranked && ch.points > 0) {
    if (ch.kind !== 'room') store.set('bollyspot_done', { ...store.get('bollyspot_done', {}), [ch.board]: ch.points });
    requireName(submit);
  }
}
$('roomCreate').onclick = () => {
  const f = S.f;
  const cfg = {
    seed: crypto.getRandomValues(new Uint32Array(1))[0] & 0x3fffffff,
    cats: new Set([...f.cats].filter(c => c !== 'my')), langs: f.langs, eras: f.eras, moods: f.moods,
    famous: f.famous, diff: S.diff, tries: S.maxTries,
  };
  const decoded = decodeRoom(encodeRoom(cfg));
  startChallenge('room', decoded);
  copyText(roomUrl(decoded.code), 'Room created — link copied, send it to friends!');
};
$('roomJoin').onclick = () => {
  const cfg = decodeRoom($('roomCodeInput').value);
  if (!cfg) { toast('That room code doesn\'t look right', 'bad'); return; }
  startChallenge('room', cfg);
};
function copyText(text, okMsg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => toast(okMsg, 'good'))
    .catch(() => window.prompt('Copy this:', text));
}

/* ------------------------------------------------------------------ party */
function partyOver() {
  const ranked = S.teams.map(t => ({ ...t })).sort((a, b) => b.score - a.score);
  const tie = ranked.length > 1 && ranked[1].score === ranked[0].score;
  if (!tie) addHistory('🎉 ' + ranked[0].name + ' won', ranked[0].score, 'pts');
  sfx('win');
  closeModal('revealModal');
  $('lbTitle').textContent = tie ? '🤝 It\'s a tie!' : `🏆 ${ranked[0].name} wins!`;
  $('lbTabs').innerHTML = '';
  $('lbExtra').innerHTML = '';
  $('lbList').innerHTML = ranked.map((t, i) => `<div class="lbrow"><span class="rk">${i + 1}</span><span class="nm">${esc(t.name)}</span><span class="sc">${t.score}</span></div>`).join('');
  $('lbNote').textContent = 'Scores reset for the next match.';
  openModal('lbModal');
  S.teams.forEach(t => (t.score = 0));
  S.teamRounds = S.teams.map(() => 0);
  S.turn = 0;
  renderTeams();
}
$('passBtn').onclick = () => {
  if (S.roundOver || S.teams.length < 2) return;
  S.passed.add(S.turn);
  if (S.passed.size >= S.teams.length) { toast('Everyone passed!', 'bad'); endRound(false); return; }
  let next = (S.turn + 1) % S.teams.length;
  while (S.passed.has(next)) next = (next + 1) % S.teams.length;
  S.turn = next;
  sfx('hint');
  toast(`🤝 ${S.teams[S.turn].name} — same song, your shot!`);
  $('msg').textContent = `${S.teams[S.turn].name}, same song — guess it!`;
  renderTeams();
};
$('teambar').addEventListener('click', e => {
  const b = e.target.closest('[data-team]');
  if (!b) return;
  const i = +b.dataset.team;
  const name = prompt('Team name:', S.teams[i].name);
  if (name && name.trim()) { S.teams[i].name = name.trim().slice(0, 14); renderTeams(); }
});

/* ------------------------------------------------------------------ leaderboards */
function addHistory(label, value, unit) {
  const h = store.get('bollyspot_hist', []);
  h.unshift({ label, value, unit, d: new Date().toISOString().slice(0, 10) });
  store.set('bollyspot_hist', h.slice(0, 40));
}
let boardTab = 'survival', boardRoom = null;
function renderBoardData(r) {
  if (!r || !r.configured) {
    $('lbList').innerHTML = '';
    $('lbNote').textContent = r && r.offline
      ? 'Global leaderboards are unavailable right now — your results are saved on this device under “This device”.'
      : 'Global leaderboards aren\'t switched on for this site yet — your results are saved on this device under “This device”.';
    return;
  }
  if (r.error) { $('lbNote').textContent = 'Couldn\'t load the leaderboard (' + r.error + ').'; return; }
  const unit = boardTab === 'survival' ? 'songs' : 'pts';
  $('lbList').innerHTML = r.entries.length
    ? r.entries.map((e, i) => `<div class="lbrow ${e.you ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(e.name)}${e.you ? ' (you)' : ''}</span><span class="sc">${e.score} <small>${unit}</small></span></div>`).join('')
    : '<div class="lbnote">No scores yet — be the first!</div>';
  $('lbNote').textContent = r.you ? `You're #${r.you.rank} of ${r.total} with ${r.you.score} ${unit}.` : (r.total ? `${r.total} players` : '');
}
async function loadTab(tab) {
  boardTab = tab;
  document.querySelectorAll('#lbTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('lbNote').textContent = '';
  if (tab === 'local') {
    const h = store.get('bollyspot_hist', []);
    $('lbList').innerHTML = h.length
      ? h.map(x => `<div class="lbrow"><span class="nm">${esc(x.label)} <small class="muted">${x.d}</small></span><span class="sc">${x.value} <small>${x.unit}</small></span></div>`).join('')
      : '<div class="lbnote">Nothing yet — finish a survival run, daily or party match.</div>';
    return;
  }
  $('lbList').innerHTML = '<div class="lbnote">Loading…</div>';
  const board = tab === 'survival' ? 'survival' : tab === 'daily' ? 'daily:' + todayKey()
    : tab === 'trend' ? S.lastTrend.board : 'room:' + boardRoom;
  renderBoardData(await getBoard(board));
}
async function openBoards(tab = 'survival', opts = {}) {
  boardRoom = opts.roomCode || (S.challenge && S.challenge.kind === 'room' ? S.challenge.cfg.code : S.lastRoom);
  const tabs = [['survival', '💀 Survival'], ['daily', '📅 Today\'s daily']];
  if (S.lastTrend) tabs.push(['trend', '🔥 ' + S.lastTrend.label]);
  if (boardRoom) tabs.push(['room', '🏠 Room ' + boardRoom]);
  tabs.push(['local', '📱 This device']);
  $('lbTitle').textContent = opts.title || 'Leaderboards';
  $('lbExtra').innerHTML = opts.extra || '';
  $('lbTabs').innerHTML = tabs.map(([id, l]) => `<button data-tab="${id}">${l}</button>`).join('');
  openModal('lbModal');
  await loadTab(tabs.some(t => t[0] === tab) ? tab : 'survival');
}
$('lbTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) loadTab(b.dataset.tab); });
$('lbBtn').onclick = () => openBoards(['daily', 'room', 'trend'].includes(S.mode) ? S.mode : 'survival');

/* ------------------------------------------------------------------ player name */
function requireName(then) {
  if (player().name) { then(); return; }
  S.pendingAfterName = then;
  $('nameInput').value = '';
  openModal('nameModal');
  setTimeout(() => $('nameInput').focus(), 50);
}
$('playerBtn').onclick = () => { $('nameInput').value = player().name; openModal('nameModal'); setTimeout(() => $('nameInput').focus(), 50); };
$('nameSave').onclick = () => {
  const n = setName($('nameInput').value);
  if (!n) { toast('Pick a name with letters or numbers', 'bad'); return; }
  closeModal('nameModal');
  renderPlayer();
  toast(`👋 Hi ${n}!`, 'good');
  const then = S.pendingAfterName; S.pendingAfterName = null;
  if (then) then();
};
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('nameSave').click(); });

/* ------------------------------------------------------------------ filters & settings events */
$('filtersToggle').onclick = () => {
  const open = $('filtersBody').hidden;
  $('filtersBody').hidden = !open;
  $('filtersToggle').setAttribute('aria-expanded', String(open));
};
$('filtersBody').addEventListener('click', e => {
  const btn = e.target.closest('button[data-v]');
  if (!btn || S.challenge) return;
  const group = btn.closest('[data-group]').dataset.group;
  const v = btn.dataset.v;
  if (GROUPS[group]) {
    const set = S.f[group];
    if (!v) set.clear(); else if (set.has(v)) set.delete(v); else set.add(v);
    if (group === 'cats' && v === 'my' && set.has('my') && !S.songs.some(s => s.c === 'my')) {
      set.delete('my'); importer.open(); toast('Import some songs first'); return;
    }
    S.played.clear();
  } else if (group === 'fame') S.f.famous = v === '1';
  else if (group === 'diff') S.diff = v;
  else if (group === 'tries') S.maxTries = +v;
  else if (group === 'teams') { S.teamsN = +v; if (S.mode === 'party') { save(); setMode('party'); return; } }
  else if (group === 'rounds') { S.rounds = +v; S.teamRounds = S.teams.map(() => 0); }
  save(); renderFilters();
  if (GROUPS[group] || group === 'fame') newRound();
  else { S.tries = Math.min(S.tries, S.maxTries - 1); renderRound(); }
});
$('filtersReset').onclick = () => {
  for (const g of Object.keys(GROUPS)) S.f[g].clear();
  S.f.famous = true; S.f.artist = '';
  save(); renderFilters(); newRound();
};
$('artistInput').addEventListener('change', e => {
  const v = e.target.value.trim();
  if (!v || S.challenge) return;
  S.f.artist = v; S.played.clear();
  save(); renderFilters(); newRound();
  toast(`🎙 Only ${v} — other filters off`);
});
$('artistClear').onclick = () => { S.f.artist = ''; save(); renderFilters(); newRound(); };

$('settingsBtn').onclick = () => openModal('settingsModal');
$('swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-spot]');
  if (!b) return;
  S.prefs.spot = b.dataset.spot; save(); applyPrefs();
});
function applyPrefs() {
  document.body.dataset.spot = S.prefs.spot;
  document.querySelectorAll('.swatch').forEach(el => el.classList.toggle('on', el.dataset.spot === S.prefs.spot));
  $('fromStart').checked = S.prefs.fromStart;
  $('sfx').checked = S.prefs.sfx;
  $('volume').value = S.prefs.volume;
}
$('fromStart').onchange = e => { S.prefs.fromStart = e.target.checked; save(); };
$('sfx').onchange = e => { S.prefs.sfx = e.target.checked; save(); sfx('good'); };
$('volume').oninput = e => { S.prefs.volume = +e.target.value; audio.volume = S.prefs.volume / 100; save(); };
document.querySelector('[data-group="timer"]').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  S.timer = +b.dataset.v; stopTimerClock(); save(); renderFilters();
  toast(S.timer ? `⏱ ${S.timer}s to guess after you hit play` : 'Timer off');
});
$('resetStats').onclick = () => {
  S.score = 0; S.streak = 0; S.best = 0; S.teams.forEach(t => (t.score = 0));
  save(); renderStats(); renderTeams(); toast('Stats reset');
};

/* ------------------------------------------------------------------ game buttons */
$('playBtn').onclick = playClip;
$('moreBtn').onclick = () => { if (!S.roundOver) useTry('⏩ More time', ''); };
$('skipBtn').onclick = () => { if (!S.roundOver) endRound(false); };
$('nextBtn').onclick = () => { closeModal('revealModal'); newRound(); };
$('fullBtn').onclick = playFull;
document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === ' ' && !typing) { e.preventDefault(); playClip(); }
  if (e.key === 'Enter' && !$('revealModal').hidden && !typing) { e.preventDefault(); $('nextBtn').click(); }
});

/* ------------------------------------------------------------------ boot */
let importer;
function renderCounts() {
  const by = c => S.songs.filter(s => s.c === c).length.toLocaleString('en-IN');
  $('catalogCount').textContent = `${S.songs.length.toLocaleString('en-IN')} songs · ${by('b')} Bollywood · ${by('h')} Hollywood · ${by('i')} Indie · ${by('p')} Punjabi · ${by('my')} imported`;
}
function buildArtistList() {
  const count = new Map();
  for (const s of S.songs) for (let a of s.a.split(/,|&|feat\.?/i)) {
    a = a.trim();
    if (a.length > 2) count.set(a, (count.get(a) || 0) + 1);
  }
  $('artistList').innerHTML = [...count].filter(x => x[1] >= 6).sort((a, b) => b[1] - a[1]).slice(0, 600)
    .map(([a]) => `<option value="${esc(a)}">`).join('');
}

(async function boot() {
  loadState();
  applyPrefs();
  try {
    S.songs = await loadCatalog();
  } catch (e) {
    $('loading').innerHTML = '<div>Couldn\'t load the song list — check your connection and refresh.</div>';
    return;
  }
  S.songs.push(...loadMySongs());
  importer = initImporter({ songs: S.songs, toast, openModal, closeModal, onChange: () => { renderCounts(); renderFilters(); } });
  buildArtistList();
  renderCounts();
  if (S.mode === 'party') S.teams = Array.from({ length: S.teamsN }, (_, i) => ({ name: 'Team ' + (i + 1), score: 0 }));
  renderAll();
  const roomParam = new URLSearchParams(location.search).get('room');
  const cfg = roomParam ? decodeRoom(roomParam) : null;
  if (cfg) { startChallenge('room', cfg); toast('🏠 Joined a friends\' room — same 10 songs for everyone'); }
  else newRound();
  $('loading').hidden = true;
  if (location.hostname === 'localhost') window.__bs = { S, submitGuess, newRound };
  if (!player().name) setTimeout(() => toast('Tip: tap “Set name” to appear on the global leaderboards'), 1500);
})();
