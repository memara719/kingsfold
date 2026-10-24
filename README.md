# Kingsfold

Build a village. Grow a kingdom. First to 8 crowns wins.

Kingsfold is a pixel-art trading and building game for 2 to 6 players, played in the browser. One friend makes a room, shares the 4-letter code or link, and everyone plays together online. You can also play alone against bots.

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
| `server/server.js` | Serves the files and runs rooms over WebSockets |
| `client/` | The browser game: pixel board renderer, sprites, chiptune sound and UI |
| `test/` | Rule tests (`npm test`) and browser play-throughs in `test/browser/` |

The server holds the real game state. Each player only receives their own hand, so nobody can peek by inspecting the page.

## Tests

```sh
npm test
```

This plays 300 full bot games plus checks on individual rules. The browser play-throughs in `test/browser/` need Playwright and a running server (`URL=http://localhost:8080/ node test/browser/play-bots.mjs`).
