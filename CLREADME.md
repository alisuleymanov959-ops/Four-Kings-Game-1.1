# Four Kings

## Play locally
1. Install Node.js 18+ (https://nodejs.org)
2. In this folder: `npm install` then `npm start`
3. Open http://localhost:3000

## Play online (2 or 4 players) (no GitHub needed)
Option A - your PC + free tunnel (easiest): keep `npm start` running, then in a second terminal run
`cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`). Share the https link it prints; the lobby's invite link will use it
(open the game through the tunnel URL yourself, then Create Game).
Option B - Replit / Railway / Render / Fly.io: upload this folder (or the zip), start command `npm start`; the server reads the PORT variable.
The host must support WebSockets and HTTPS.

Reconnect: refresh or reopen the page; your kingdom is kept for 5 minutes.

## Deploy from a phone (GitHub + Render, free)
1. github.com -> New repository (any name) -> add the 3 files: server.js, index.html, package.json (Add file -> Create new file, paste each).
2. render.com -> sign in with GitHub -> New -> Web Service -> pick the repo.
3. Build command: `npm install`   Start command: `npm start`   Plan: Free.
4. Open the https URL Render gives you, tap Create Game, share the invite link. (Free plans sleep when idle; the first load can take ~1 minute.)
