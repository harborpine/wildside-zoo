/* Renderer: one quick headless screenshot of the floor harness.  node test/render-peek.js <name> [query] [waitMs] [js-to-run] */
const path = require('path'), pw = require('./pw.js');
(async () => {
  const [name = 'peek', query = '', wait = '3000', js = ''] = process.argv.slice(2);
  const b = await pw.chromium.launch({ headless: true }), c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }), p = await c.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto(require('url').pathToFileURL(path.join(__dirname, 'render-floor.html')).href + (query ? '?' + query : ''));
  await p.waitForFunction('window.RT && RT.ready'); if (js) await p.evaluate(js); await p.waitForTimeout(+wait);
  await p.screenshot({ path: path.join(__dirname, 'shots', 'render-' + name + '.png') });
  console.log(JSON.stringify(await p.evaluate(() => ({ d: ZRender.debug(), log: RT.log, err: RT.errors }))));
  await b.close();
})();
