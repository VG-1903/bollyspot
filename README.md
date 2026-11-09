# BollySpot 🎬🎵

Guess the song from a tiny audio clip — Bollywood, Hollywood, Indie and Punjabi.
Live at **https://bollyspot.vercel.app**

## Modes

- **Classic** — endless, with your own filters
- **Survival** — one miss ends the run; best streaks go on the global leaderboard
- **Daily** — the same 10 songs for everyone each day (rolls over at midnight IST)
- **Friends** — create a room; everyone with the link gets the same 10 songs and a shared leaderboard
- **Party** — pass-and-play teams on one device, with passing and per-team rounds

Filters are multi-select (e.g. Bollywood + Punjabi, 2000s + 2010s), plus mood,
famous-only and a single-artist mode. Search tolerates Hinglish spelling variants,
typos, missing spaces and initials (`ddlj`, `kkhh`).

## Architecture

```
index.html, css/, js/         static frontend (ES modules, no build step)
  js/app.js                   game, modes, UI
  js/search.js                search engine
  js/challenge.js             seeded daily/room song sequences; room codes encode their settings
  js/api.js                   player identity + leaderboard client
data/songs.json               packed song catalog, cached at the edge
api/scores.js                 Vercel serverless function: global leaderboards
lib/redis.js                  Upstash Redis REST client (no dependencies)
tools/                        catalog pipeline (not deployed)
```

Players need no account: each device gets a random player id plus a chosen name.
Daily and room songs are derived from a seed, so every player sees the same
sequence without any server state; only scores are stored.

### Trending (refreshes itself)

`/api/trending` reads Apple's live charts (Apple Music most-played for India and the
US, plus the iTunes India Bollywood chart), fetches 30-second previews, drops
regional-language, devotional, score and remix tracks, and picks three sets of 10:

| Period | Pool | Rolls over |
|---|---|---|
| Today's charts (`d`) | top of the current charts | midnight IST |
| This week's new drops (`w`) | released in the last ~3 weeks | Monday (ISO week) |
| This month's hits (`m`) | released in the last ~2 months | 1st of the month |

Each set is ~6 Indian + 4 international songs, at most 2 per Indian artist and 1 per
international artist. Responses are edge-cached for 6 hours. With Redis connected,
each period's picks are frozen on first use so every player gets the same songs.

### Selling a sponsored slot

Edit `data/sponsor.json` and redeploy:

```json
{
  "active": true,
  "name": "Label name",
  "headline": "presents this week's new drops",
  "url": "https://link-to-the-campaign",
  "color": "#ff4da6",
  "start": "2026-11-16",
  "end": "2026-11-22",
  "periods": ["w"],
  "trackIds": ["6829145293", "6826737455"]
}
```

`trackIds` are Apple Music / iTunes track ids (the number at the end of a song's
Apple Music link). Up to 4 of them lead the sponsored period's 10 songs, and the
challenge shows a "Presented by …" banner linking to `url`. Sponsored picks are only
frozen for periods that start while the sponsorship is active, so set it up before
the period begins (e.g. before Monday for a weekly slot).

### Enabling global leaderboards

The scores API stores data in Redis via Upstash. In the Vercel dashboard open the
project → **Storage** → **Create** → **Upstash for Redis** (free tier) and connect it
to the project; Vercel sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically.
Redeploy. Until then the game works fully and keeps results on each device.

## Rebuilding the catalog

```
powershell -File tools/build_catalog.ps1   # ~40 min, rate-limited iTunes searches
node tools/dedupe.js                       # clean, dedupe, pack -> data/songs.json
```

`tools/sources.json` lists the films and artists that get searched. Alternate
recordings (remix, unplugged, live, acoustic, lofi, reprise, mashup, covers…) are
rejected from the raw iTunes titles before any cleanup, so only original
recordings make it in.

Fan-made; not affiliated with Apple, any label or artist. 30-second previews and
artwork are streamed from Apple's servers via the iTunes Search API.
