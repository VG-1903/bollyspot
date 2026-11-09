import { indexSong } from './search.js';

const P_PREFIX = 'https://audio-ssl.itunes.apple.com/itunes-assets/';

export function previewUrl(s) {
  return s.p.startsWith('http') ? s.p : P_PREFIX + s.p;
}

export function artUrl(s, size = 300) {
  if (!s.i) return '';
  if (s.i.startsWith('http')) return s.i.replace(/\d+x\d+bb/, `${size}x${size}bb`);
  const bar = s.i.indexOf('|');
  return `https://is${s.i.slice(0, bar)}-ssl.mzstatic.com/image/thumb/${s.i.slice(bar + 1)}/${size}x${size}bb.jpg`;
}

export function eraOf(y) {
  if (!(y > 0)) return 'unknown';
  if (y < 1990) return 'classic';
  if (y < 2000) return '90s';
  if (y < 2010) return '2000s';
  if (y < 2020) return '2010s';
  return '2020s';
}

// keyword mood tagging (approximate — iTunes has no mood data)
const SAD = ['sad', 'judaa', 'judai', 'judaai', 'bewafa', 'tanha', 'tanhai', 'akela', 'akele', 'alvida', 'dard', 'aansu', 'ansoo', 'aansoo', 'rona', 'royenge', 'gham', 'bichhad', 'bichad', 'yaad', 'intezaar', 'intezar', 'tadap', 'doori', 'dooriyan', 'khamoshi', 'adhura', 'adhoora', 'toota', 'tuta', 'bhula', 'bhoola', 'ashq', 'zakhm', 'barbaad', 'bekhayali', 'channa mereya', 'agar tum saath', 'kabira', 'tears', 'cry', 'crying', 'broken', 'hurt', 'alone', 'lonely', 'goodbye', 'miss you', 'without you', 'pain', 'scars', 'fix you', 'someone like you', 'let her go', 'stay with me', 'say something', 'hurts', 'too good at goodbyes', 'before you go', 'drivers license', 'traitor', 'happier', 'when the party'];
const PEPPY = ['party', 'dance', 'naach', 'nachle', 'nach', 'jhoom', 'jhume', 'jhumka', 'dhoom', 'balle', 'shava', 'desi', 'swag', 'gabru', 'badtameez', 'chashma', 'kudi', 'patola', 'bam bam', 'dhol', 'dhinka', 'zingaat', 'gallan', 'tunak', 'twist', 'shake', 'masti', 'mast', 'halla', 'hungama', 'celebration', 'happy', 'tonight', 'feel good', 'groove', 'jump', 'dynamite', 'uptown funk', 'cant stop', 'shut up and dance', '24k', 'levitating', 'dont start now', 'blinding lights', 'shape of you', 'cheap thrills', 'timber', 'firework', 'roar', 'shake it off', 'gasolina', 'despacito', 'disco', 'rock and roll', 'footloose', 'dancing queen', 'stayin', 'september', 'celebrate', 'bhangra', 'lak', 'thumka', 'peg', 'daru'];
function moodOf(s) {
  const t = (s.t + ' ' + (s.m || '')).toLowerCase().replace(/[’']/g, '');
  for (const w of PEPPY) if (t.includes(w)) return 'p';
  for (const w of SAD) if (t.includes(w)) return 's';
  return 'n';
}

export function prepare(s) {
  indexSong(s);
  s.mood = moodOf(s);
  s.era = eraOf(s.y);
  s.key = s.c + ':' + s.p;
  return s;
}

export async function loadCatalog() {
  const r = await fetch('/data/songs.json');
  if (!r.ok) throw new Error('catalog ' + r.status);
  const list = await r.json();
  return list.map(prepare);
}
