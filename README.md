# Kingsfold

Build a village. Grow a kingdom. First to 8 crowns wins.

Kingsfold is a pixel-art trading and building game for 2 to 6 players, played in the browser. It looks and plays like a 16-bit console game: the whole screen is drawn in pixels with a hand-made font, and it fits a computer screen sideways or a phone held upright.

One friend hosts a table, the others pick it from the list of open tables, and everyone plays together online. You can also play alone against bots.

**Play it now:** https://memara719.github.io/kingsfold/ . Choose *Play with friends*, *Host a table*, and send your friends the invite link.

There are three ways to play together:

- **The website** (`site/`, built by `npm run build`). One friend's browser hosts the table and the others connect to it directly, browser to browser, through the free [PeerJS](https://peerjs.com) matchmaking service. No server to run. Every player only receives their own cards. If the host reloads, the table comes back; if the host closes their tab, the game ends. The `Website` GitHub Action rebuilds it and publishes it to the `gh-pages` branch on every push to `main`.
- **The claude.ai page.** `npm run build` makes `dist/kingsfold.html`, a single page that runs as a claude.ai artifact. Friends who can open the artifact (shared with them as contributor or editor) see each other's tables. The host's browser runs the game and every move is replayed in the other browsers, so no server is needed. If the host closes their tab mid-game, the next player takes over.
- **Your own server.** The Node server in `server/` holds the game for everyone. See below.

## Isotopia

A second, smaller game in `isotopia/`, written in Python with [pygame](https://pyga.me): an island in 1955 racing to build the city of tomorrow.

**Play it:** https://memara719.github.io/kingsfold/isotopia/ (the first load takes a few seconds while Python starts in the browser). Or on your computer: `pip install pygame-ce`, then `python isotopia/main.py`.

- Forests give Lumber, quarries Cement, farms Food and steel mills Steel. Two rare mines give **Uranium**.
- Road: Lumber + Cement. House: Lumber + Cement + Food (1 point). Atomic town: 2 Food + 2 Steel, upgrades a house (2 points, pays double). Fallout shelter: Cement + Steel, protects one building.
- **The bomb:** with 5 Uranium, pick a land. Every building on its corners is destroyed (unless it has a shelter) and the land becomes a crater forever. Each player gets one bomb. The bank never sells Uranium, and everyone can see who is collecting it.
- A 7 moves the radiation cloud, which blocks a land and grabs a card. Bank trades are 3 for 1. First to 8 points wins (longest road is worth 2).
- **Play online:** choose *Play online*, *Host a table*, and send friends the invite link (or the 4-letter code). The host's browser runs the game and friends connect to it directly through PeerJS, so no server is needed; each player only sees their own cards. Reloading rejoins (the host too), and a bot plays for anyone whose connection drops until they're back. Online play is in the browser version only.
- **Or share one screen:** *Play on this screen*, 2 to 4 people passing it around (cards hide while you pass), bots in the other seats. Professor Atom gives tips during your first game.

Tests: `python3 test/test_isotopia.py` (rules and 200 bot games) and `python3 test/isotopia_play.py` (plays through the real screen with no window). `test/browser/isotopia-online.mjs` plays three browsers online on the pygbag build; it needs a local copy of the pygbag runtime (github.com/pygame-web/cdn) and `test/browser/peer-server.mjs`.

## Play it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install
npm start
```

Then open http://localhost:8080. Friends on the same Wi-Fi can join at `http://<your computer's IP>:8080`.

## Put it online for friends

The game is one small Node.js server, so any host that runs Node works. On [Render](https://render.com) (free tier):

1. Push this folder to a GitHub repository.
2. In Render, choose **New > Web Service** and pick the repository.
3. Build command: `npm install`. Start command: `npm start`.
4. Open the address Render gives you and share it.

Render sets the `PORT` variable on its own. The free tier sleeps after about 15 minutes with nobody on it, so the first visit after that takes a few seconds to wake up. Rooms live in memory, so a restart ends any game in progress.

## The rules in one minute

- **Your turn:** roll the dice, trade, then build.
- **Rolling:** every land showing the rolled number pays the villages next to it (towns get 2).
- **Building:** road (Wood, Brick), village (Wood, Brick, Wool, Grain), town (2 Grain, 3 Iron), King's card (Wool, Grain, Iron).
- **Workshops:** one per village or town, 2 cards each. Bakery, Hunter's Lodge and Blacksmith add 1 extra Grain, Wood or Iron from the lands they touch. A Fishing Hut (river or coast) gives you a free card when a roll pays you nothing.
- **Crowns:** village 1, town 2, longest road (5+) 2, most knights (3+) 2, secret crown card 1. First to 8 on their own turn wins.
- **A 7:** the bandits leave the slum. Anyone holding more than 7 cards drops half. The roller moves the bandits to a land that then pays nothing, and steals a card from someone living there.
- **Houses:** each player picks one, with one small power, such as a free workshop or 3-for-1 bank trades.
- **The King's news:** one event each round, like a harvest festival or a dragon over the mountains.

The game itself teaches all this: only legal moves glow, buttons show their prices, and the King gives short tips during your first game.

## How the code is laid out

| Path | What it does |
| --- | --- |
| `shared/board.js` | Board geometry: hexes, corners, edges, the river |
| `shared/game.js` | All the rules. `apply(state, player, action)` checks and performs one move |
| `shared/bot.js` | Bots, also used when a turn timer runs out |
| `shared/host.js` | Runs one game: bots, turn timers, players who drop out |
| `shared/table.js` | One table: seats, lobby and game. Run by the Node server, or by the host's browser on the website |
| `server/server.js` | Serves the files and runs tables over WebSockets |
| `client/main.js` | The screens: title, tables, lobby and the game, all drawn on one canvas |
| `client/ui.js`, `client/font.js` | RPG-style windows, buttons and the hand-drawn pixel font |
| `client/net.js` | Talking to a table: the Node server, a friend's browser (website), the claude.ai room, or local bots |
| `client/board-view.js`, `client/sprites.js`, `client/audio.js` | Pixel map, sprites and chiptune sound |
| `tools/build-single.mjs` | Bundles everything into one HTML page: the website or the claude.ai page |
| `test/` | Rule tests (`npm test`) and browser play-throughs in `test/browser/` |

The server holds the real game state. Each player only receives their own hand, so nobody can peek by inspecting the page.

## Tests

```sh
npm test
```

This plays 300 full bot games plus checks on individual rules. The browser play-throughs in `test/browser/` need Playwright:

- `play-bots.mjs`: a whole game against bots through the screen (`URL=http://localhost:8080/`).
- `play-online.mjs`: two players at one server table, with a reload mid-game.
- `play-web.mjs`: three browsers on the website build, joining by link and by code, with a guest reload and a host reload. Run `node test/browser/peer-server.mjs` first for a local PeerJS server.
- `play-room.mjs`: three tabs at one table on the one-file page, using `mock-room.js` in place of claude.ai's room. It checks that every screen stays in step, that a reload rejoins, and that another player takes over when the host leaves.
