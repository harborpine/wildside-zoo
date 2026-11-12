/* Ticks 960 weeks through ZT and reports the save and log size. */
const path = require('path'); const { chromium } = require('./pw.js');
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///' + path.resolve(__dirname, '..').split(path.sep).join('/') + '/index.html'); await p.waitForFunction(() => window.ZT && document.documentElement.dataset.ready);
  const r = await p.evaluate(() => { ZCore.onReport('*', (x, d) => d()); ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 6e8; let maxSave = 0;
    for (let i = 0; i < 960; i++) { ZT.tick(1); if (i % 48 === 47) { ZT.save(); maxSave = Math.max(maxSave, localStorage.getItem('wildside-zoo-v3').length); } }
    ZT.save(); return { week: ZT.S.week, saveKB: Math.round(localStorage.getItem('wildside-zoo-v3').length / 1024), maxSaveKB: Math.round(maxSave / 1024), logKB: Math.round(ZT.logText().length / 1024), errors: ZT.errors.slice(0, 3) }; });
  console.log(JSON.stringify(r), errs.length ? errs : ''); await b.close();
})();
