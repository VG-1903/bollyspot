// "My songs": match a pasted list, a CSV export, or Spotify Liked Songs to playable previews.
import { norm, lev } from './search.js';
import { prepare } from './data.js';

const STORE = 'bollyspot_my';
const $ = id => document.getElementById(id);

export function loadMySongs() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]').map(prepare); } catch (e) { return []; }
}
function saveMySongs(list) {
  const raw = list.map(({ t, a, m, y, p, i, c, l, f }) => ({ t, a, m, y, p, i, c, l, f }));
  try { localStorage.setItem(STORE, JSON.stringify(raw)); } catch (e) {}
}

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; } }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function extractTracks(text) {
  const tracks = [];
  if (text.includes(',') && /track|name|artist|title/i.test(text.split('\n')[0])) {
    const rows = parseCSV(text);
    const head = rows[0].map(h => h.toLowerCase());
    let ti = head.findIndex(h => /track.?name|^name$|^title$|^song/.test(h));
    let ai = head.findIndex(h => /artist/.test(h));
    if (ti < 0) ti = 1;
    if (ai < 0) ai = ti + 1;
    for (const r of rows.slice(1)) if (r[ti] && r[ai]) tracks.push({ t: r[ti].trim(), a: r[ai].trim().split(/[,;]/)[0].trim() });
  } else {
    for (const line of text.split('\n')) {
      const m = line.split(/\s+[-–—]\s+|\s+by\s+/i);
      if (m.length >= 2 && m[0].trim()) tracks.push({ t: m[0].trim(), a: m[1].trim() });
      else if (line.trim().length > 2) tracks.push({ t: line.trim(), a: '' });
    }
  }
  return tracks.slice(0, 300);
}

let jsonpN = 0;
function itunes(term, country) {
  return new Promise(resolve => {
    const cb = '__itcb' + (jsonpN++);
    const sc = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); resolve(null); }, 8000);
    function cleanup() { clearTimeout(timer); delete window[cb]; sc.remove(); }
    window[cb] = data => { cleanup(); resolve(data); };
    sc.src = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term) + '&country=' + country + '&media=music&entity=song&limit=8&callback=' + cb;
    sc.onerror = () => { cleanup(); resolve(null); };
    document.head.appendChild(sc);
  });
}
const VERSION_RX = /\b(remix|unplugged|live|acoustic|lo-?fi|slowed|reverb|sped up|mashup|cover|reprise|karaoke|instrumental)\b/i;
async function matchTrack(tr) {
  for (const country of ['IN', 'US']) {
    const data = await itunes((tr.t + ' ' + tr.a).trim(), country);
    if (!data || !data.results) continue;
    const want = norm(tr.t.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s-\s.*$/, ''));
    const results = data.results.filter(r => r.previewUrl).sort((a, b) => VERSION_RX.test(a.trackName) - VERSION_RX.test(b.trackName));
    for (const r of results) {
      const clean = r.trackName.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s-\s.*$/, '').trim();
      const got = norm(clean);
      if (got === want || got.includes(want) || want.includes(got) || lev(want, got, 1) <= 1) {
        return prepare({
          t: clean || r.trackName, a: r.artistName, m: '', y: r.releaseDate ? +r.releaseDate.slice(0, 4) : 0,
          p: r.previewUrl, i: (r.artworkUrl100 || '').replace('100x100', '300x300'), c: 'my',
          l: /Punjabi/i.test(r.primaryGenreName || '') ? 'pa' : /Bollywood|Filmi|Indian|Sufi|Ghazal/i.test(r.primaryGenreName || '') ? 'hi' : 'en', f: 1,
        });
      }
    }
  }
  return null;
}

export function initImporter(ctx) {
  // ctx: { songs, toast, onChange, openModal, closeModal }
  let mine = ctx.songs.filter(s => s.c === 'my');
  let busy = false;

  async function scan(tracks) {
    if (busy || !tracks.length) return;
    busy = true;
    $('impStart').textContent = 'Scanning…';
    const have = new Set(mine.map(s => s.p));
    let done = 0, added = 0;
    for (const tr of tracks) {
      const hit = await matchTrack(tr);
      done++;
      if (hit && !have.has(hit.p)) { have.add(hit.p); mine.push(hit); ctx.songs.push(hit); added++; }
      $('impProg').style.width = (done / tracks.length * 100) + '%';
      $('impStatus').textContent = `${done}/${tracks.length} scanned · ${added} new matches`;
      await new Promise(r => setTimeout(r, 250));
    }
    saveMySongs(mine);
    busy = false;
    $('impStart').textContent = 'Scan & match';
    $('impStatus').textContent = `Done — ${added} new songs (${mine.length} in 💚 My songs).`;
    ctx.toast(`💚 ${added} songs added to My songs`, 'good');
    ctx.onChange();
  }

  $('importBtn').onclick = () => { ctx.closeModal('settingsModal'); open(); };
  function open() {
    $('impStatus').textContent = mine.length ? mine.length + ' songs imported so far.' : '';
    ctx.openModal('importModal');
  }
  $('impFile').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { $('impText').value = rd.result; $('impStatus').textContent = 'File loaded — hit Scan & match.'; };
    rd.readAsText(f);
  };
  $('impStart').onclick = () => {
    const tracks = extractTracks($('impText').value);
    if (!tracks.length) { $('impStatus').textContent = 'Nothing to scan — paste songs or choose a CSV first.'; return; }
    scan(tracks);
  };
  $('clearMyBtn').onclick = () => {
    mine = [];
    saveMySongs(mine);
    for (let i = ctx.songs.length - 1; i >= 0; i--) if (ctx.songs[i].c === 'my') ctx.songs.splice(i, 1);
    ctx.toast('Imported songs cleared', '');
    ctx.onChange();
  };

  // Spotify Connect (PKCE) — needs a Client ID from the user's own Spotify developer app
  const redirect = location.origin + location.pathname;
  try { $('spClientId').value = localStorage.getItem('bollyspot_spid') || ''; } catch (e) {}
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  $('spConnect').onclick = async () => {
    const cid = $('spClientId').value.trim();
    if (!cid) { $('impStatus').textContent = 'Paste your Spotify Client ID first.'; return; }
    try { localStorage.setItem('bollyspot_spid', cid); } catch (e) {}
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    try { sessionStorage.setItem('bollyspot_spv', verifier); } catch (e) {}
    location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: cid, response_type: 'code', redirect_uri: redirect,
      scope: 'user-library-read', code_challenge_method: 'S256', code_challenge: challenge,
    });
  };
  (async function spotifyReturn() {
    const code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    history.replaceState({}, '', redirect);
    let verifier = '', cid = '';
    try { verifier = sessionStorage.getItem('bollyspot_spv') || ''; cid = localStorage.getItem('bollyspot_spid') || ''; } catch (e) {}
    if (!verifier || !cid) return;
    open();
    $('impStatus').textContent = 'Connecting to Spotify…';
    try {
      const tok = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: cid, code_verifier: verifier }),
      }).then(r => r.json());
      if (!tok.access_token) { $('impStatus').textContent = 'Spotify login failed: ' + (tok.error_description || tok.error || 'no token'); return; }
      $('impStatus').textContent = 'Reading your Liked Songs…';
      const tracks = [];
      let url = 'https://api.spotify.com/v1/me/tracks?limit=50';
      while (url && tracks.length < 300) {
        const page = await fetch(url, { headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json());
        if (!page.items) break;
        for (const it of page.items) if (it.track) tracks.push({ t: it.track.name, a: (it.track.artists[0] || {}).name || '' });
        url = page.next;
      }
      if (!tracks.length) { $('impStatus').textContent = 'No liked songs found on this account.'; return; }
      $('impStatus').textContent = `Found ${tracks.length} liked songs — matching previews…`;
      scan(tracks);
    } catch (e) {
      $('impStatus').textContent = 'Spotify scan failed — ' + e.message;
    }
  })();

  return { open };
}
