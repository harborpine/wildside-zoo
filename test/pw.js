/* Shared helper: find Playwright without adding dependencies to this repo.
   Usage: const { chromium, webkit } = require('./pw.js');  Always launch headless (the default). Never open a visible window.
   The installed browsers on this PC match Playwright 1.64, so copies of that version are tried first. */
const tries = ['playwright', 'C:/claudecodeprojects/pick-tonight/node_modules/playwright', 'C:/claudecodeprojects/pip-and-blade/node_modules/playwright',
  'C:/claudecodeprojects/what-to-watch/node_modules/playwright', 'C:/Lifegame/node_modules/playwright'];
let pw = null;
for (const t of tries) { try { pw = require(t); break; } catch (e) { /* next */ } }
if (!pw) throw new Error('Playwright not found. Tried: ' + tries.join(', '));
module.exports = pw;
