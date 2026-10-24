# BollySpot 🎬🎵

Guess the Bollywood song from a tiny audio clip — a Bollywood take on
[Songspot](https://songspot.net)-style games.

**Play:** open `index.html`, or the deployed site.

## Features

- 2,295 Bollywood songs from the 1950s to the 2020s, with 30-second
  preview clips and album art via the iTunes Search API
- Era filters: Classic, 90s, 2000s, 2010s, 2020s
- Five difficulties — from a 3-second clip (Easy) down to 0.1s (Impossible)
- 5 attempts per song; each miss or hint doubles the clip length
- Score, streak and best-streak saved locally
- Space bar replays the snippet

## Play with your own songs

Open ☰ → **Import my songs**:

- **Paste** a list (`Song - Artist`, one per line), or
- **Drop a CSV** export of your Spotify library (get one from
  [exportify.net](https://exportify.net)), or
- **Connect Spotify** directly: create a free app at
  [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard),
  add the game's URL as a Redirect URI, paste the app's Client ID into the
  dialog, and hit Connect — your Liked Songs are scanned automatically
  (up to 300).

Every track is matched to a playable 30-second preview through the iTunes
Search API and saved in your browser as the **💚 My songs** catalog.
(Spotify's own API no longer serves audio previews, so playback always
comes from iTunes matches.)

## Structure

- `index.html` — the whole game, self-contained (song catalog embedded);
  this is what Vercel serves
- `index.template.html` — source without the embedded catalog
- `data/songs.json` — the song catalog (source of truth)
- `build.ps1` — embeds `data/songs.json` into the template to produce
  `index.html`; run it after changing either file
- `tools/fetch_famous_bolly.ps1` — merges iconic film soundtracks and top
  tracks of famous artists from the iTunes Search API into
  `data/songs.json` (deduplicated, film year used as the release year)

Audio streams from Apple's preview CDN, so an internet connection is needed.
Fan-made game; not affiliated with Apple or any label.
