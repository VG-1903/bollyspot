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

## Structure

- `index.html` — the whole game, self-contained (song catalog embedded)
- `index.template.html` — source without the embedded catalog; the build
  replaces `/*__SONGS__*/` inside the `songdata` script tag with the JSON

Audio streams from Apple's preview CDN, so an internet connection is needed.
Fan-made game; not affiliated with Apple or any label.
