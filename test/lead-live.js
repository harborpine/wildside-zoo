// Lead check: load the hosted game in the iPhone browser engine, tap the floor, open a box, let time run, reload.
const { webkit, devices } = require('./pw.js');
(async () => {
  const b = await webkit.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(process.argv[2], { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const v = p.viewportSize(); const out = {};
  out.loaded = await p.evaluate(() => !!(window.ZT && ZT.S && window.ZRender && window.ZMenus && window.ZMoments));
  out.sprites = await p.evaluate(() => ZRender.debug().sprites);
  await p.screenshot({ path: 'test/shots/lead-live-floor.png' });
  await p.touchscreen.tap(v.width / 2, v.height / 2); await p.waitForTimeout(700);
  out.menu = await p.evaluate(() => ZT.stack()); await p.screenshot({ path: 'test/shots/lead-live-menu.png' });
  await p.evaluate(() => ZT.popAll()); await p.evaluate(() => ZT.setSpeed(2)); const w0 = await p.evaluate(() => ZT.S.week);
  await p.waitForTimeout(11500); await p.evaluate(() => ZT.popAll()); out.weeksPassed = (await p.evaluate(() => ZT.S.week)) - w0;
  await p.evaluate(() => ZT.save()); const w1 = await p.evaluate(() => ZT.S.week); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500);
  out.weekKeptAfterReload = (await p.evaluate(() => ZT.S.week)) >= w1;
  out.manifest = await p.evaluate(() => document.querySelector('link[rel=manifest]') && document.querySelector('link[rel=manifest]').href);
  out.appleIcon = await p.evaluate(() => (document.querySelector('link[rel=apple-touch-icon]') || {}).href);
  out.standaloneMeta = await p.evaluate(() => !!document.querySelector('meta[name=apple-mobile-web-app-capable],meta[name=mobile-web-app-capable]'));
  out.errors = errs; console.log(JSON.stringify(out, null, 1)); await b.close();
})();
