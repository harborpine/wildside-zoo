# Wildside Zoo

A phone-first, pixel-art zoo management game. One scored run lasts 20 in-game years.

## Play it on a computer

Double-click `Play Wildside Zoo.cmd` (or open `index.html` in any browser). The game shows as a phone-width column.
Tap or click the zoo to open the menu. Your game saves in that browser by itself.

## What is in this folder

- `index.html`, `style.css`, `core.js` : the page, clock, saving and the play log.
- `data.js`, `engine.js` : every number and rule in the game. No screen code.
- `geo.js`, `sprites.js`, `render.js` : the slanted hex floor and all the pixel art, drawn in code.
- `menus.js`, `moments.js` : the main menu with its screens, and the pop-ups the game raises by itself.
- `manifest.webmanifest`, `icons/` : what lets an iPhone save it to the home screen as a full-screen app.
- `docs/BRIEF.md` : the brief this version was built from. `docs/CONTRACTS.md` and `docs/API-*.md` : how the files talk to each other.
- `docs/TEST-REPORT.md` : what the tester found, round by round.
- `test/` : the 20-year bot (`node test/bot.js 0.8`), rule checks, and headless-browser tests that play the game by touch.
- `current/`, `starter/`, `docs/rejected-art-test.*` : the old version and early experiments, kept for reference only.

No build step and no dependencies. Everything runs offline from these files.
