// Lead check: imitate the iPhone home-screen quirk (layout box shorter than the screen by the status bar) and report how the page lays out.
const { webkit } = require('./pw.js'); const path = require('path');
(async () => {
  const b = await webkit.launch(); const ctx = await b.newContext({ viewport: { width: 402, height: 812 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(require('url').pathToFileURL(path.resolve('index.html')).href + '?play=1&standalone=1&inset=34&insett=62'); await p.waitForTimeout(1500);
  await p.touchscreen.tap(200, 450); await p.waitForTimeout(600);
  const out = await p.evaluate(() => { const r = e => { const x = e.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.bottom)]; }; const btns = [...document.querySelectorAll('#screens .btn')]; const last = btns[btns.length - 1];
    return { inner: innerHeight, screen: screen.height, docScroll: document.documentElement.scrollHeight, app: r(document.getElementById('app')), strip: r(document.getElementById('strip')), date: r(document.getElementById('s-date')), lastBtn: last ? [last.textContent, ...r(last)] : null, appPos: getComputedStyle(document.getElementById('app')).position, scrollY }; });
  await p.screenshot({ path: 'test/shots/lead-sa.png', fullPage: true }); console.log(JSON.stringify(out), errs); await b.close();
})();
