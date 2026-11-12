# Wildside Zoo source hand-off

- `docs/BRIEF.md` : the full brief for the rebuild. Start here.
- `current/` : the working game as it runs in the claude.ai artifact today (hex map, version 2).
- `test/bot.js` : simulated player for checking rule changes. Run with `node test/bot.js 0.8`.
- `starter/geo.js` : hex geometry for the tilted pixel view, as a starting point.
- `docs/rejected-art-test.*` : the first pixel-art test. The method worked; the look was rejected as too small and far away.

Note: `current/ui.js` saves to a database that only exists inside claude.ai. Opened from disk it falls back to saving in the browser, which is fine for reference.
