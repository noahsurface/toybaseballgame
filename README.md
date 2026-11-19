# Toy Baseball

A tabletop toy baseball **season sim** that runs in your browser. Pick one of 12 toy-town clubs, manage it
through a full season and the playoffs, and watch any of your games play out on a plastic toy-board field:
pegs for players, scoop cups for fielders, labelled wall pockets for hits, a steel ball and a lever bat.

## Play

Open `index.html` in a browser. There's no build step and no install. It also works as-is on any static
host (for example GitHub Pages: Settings → Pages → deploy from the `main` branch).

Progress saves to the browser automatically after every simulated day. Use **Options → Export save** to back
it up or move it to another device.

## What's in Season mode

- **12-team league** in two divisions, with a balanced schedule of 22, 44, 88 or 154 games.
- **Pitch-by-pitch sim** driven by player ratings (Contact, Power, Eye, Speed, Fielding, Arm for hitters;
  Velocity, Control, Movement, Stamina for pitchers), shown as letter grades from G up to S.
- **Watch on the board** or sim instantly: play one game, a week, or the rest of the season.
- **Manage your club**: batting order and defensive positions, a five-man rotation, and a closer.
- **Condition arrows** that rise and fall day to day and with performance.
- **Fatigue and injuries**: tired starters get skipped, and injured players are swapped out automatically.
- **Trades** with AI clubs up to the deadline. AI clubs also trade with each other.
- **Standings, league leaders, box scores, schedule and scouting** for every club.
- **Playoffs**: two division winners plus two wild cards, best-of-5 semifinals, best-of-7 Toy Box Series.
- **Awards and multi-season play**: MVP and top pitcher each year. Players age, improve or decline, and
  retire, with rookies taking their place.

## Code layout

| File | What it does |
| --- | --- |
| `js/util.js` | Random and formatting helpers |
| `js/data.js` | Clubs, divisions, name pools |
| `js/league.js` | Player generation, ratings, auto lineups/rotations, schedule |
| `js/engine.js` | The pitch-by-pitch game simulator (box score + replay log) |
| `js/season.js` | Daily sims, stats, condition, injuries, standings, playoffs, trades, saves |
| `js/board.js` | Canvas toy board and replay animation |
| `js/ui.js` | All screens |

Everything uses plain browser JavaScript on a global `TB` namespace, so the game runs straight from
`file://`.
