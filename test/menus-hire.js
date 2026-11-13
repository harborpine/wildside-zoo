/* Menus: counts taps and screens for hiring one person by touch.  node test/menus-hire.js [chromium|webkit] */
const path = require('path'), pw = require('./pw.js');
const URL = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html?play=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
(async () => {
  const b = await pw[process.argv[2] || 'chromium'].launch(), c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
  await p.goto(URL); await p.waitForFunction(() => window.ZT && window.ZMenus); await sleep(500);
  await p.evaluate(() => { ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; });
  let taps = 0;
  const stack = () => p.evaluate(() => ZT.stack().join('>'));
  async function tapText(t) {
    const pos = await p.evaluate(t => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); if (!L) return null; const all = [...L.querySelectorAll('button, .row.tappable, .tab, .rcard')].filter(b => b.getBoundingClientRect().width > 0); const m = all.find(b => b.textContent.trim().startsWith(t)) || all.find(b => b.textContent.includes(t)); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, t);
    if (!pos) return false; await p.touchscreen.tap(pos.x, pos.y); taps++; await sleep(550); return true;
  }
  await p.touchscreen.tap(195, 400); taps++; await sleep(500);
  await tapText('Staff'); await tapText('Notice board');
  const seen = [await stack()];
  // tap through the reveal until the "Who turned up" list is on top
  for (let i = 0; i < 8; i++) {
    const top = (await stack()).split('>').pop(); if (top === 'staff-candidates') break;
    await sleep(500); const pos = await p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), e = L.querySelector('.rcard, .panel'), r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, btns: [...L.querySelectorAll('button')].map(b => b.textContent.trim().slice(0, 12)).join('|') }; });
    console.log('  screen: ' + (await stack()) + '  buttons: ' + pos.btns);
    await p.touchscreen.tap(pos.x, pos.y); taps++; await sleep(600); seen.push(await stack());
  }
  console.log('  stacks seen: ' + seen.join('  ->  '));
  const lists = await p.evaluate(() => 0);
  check((await stack()).endsWith('staff-candidates'), 'ends on the single "Who turned up" list (' + await stack() + ')');
  const n0 = await p.evaluate(() => ZT.S.staff.length);
  await tapText('Hire');
  check(await p.evaluate(() => ZT.S.staff.length) === n0 + 1, 'one tap on Hire hires');
  console.log('  TAPS FROM THE FLOOR TO A HIRE: ' + taps);
  check(taps <= 6, 'six taps or fewer');
  await b.close(); process.exit(failures ? 1 : 0);
})();
