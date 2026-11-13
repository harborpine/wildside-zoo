/* Tester round 3: symbol audit. Opens every screen and the moments that can be opened directly, scans for leftover words/letters
   (see the scan in tester-lib.js) and screenshots each so the symbols can be judged by eye. ZT.tick and the screen entry points are used
   only to put things on screen; this is an audit, not a playthrough. Usage: node test/tester-symbols.js [chromium|webkit] */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const T = await L.launch(engine, { width: 390, height: 844 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-sym' });
  const page = T.page; await T.goto('?play=1'); const say = (...a) => console.log(...a);
  require('fs').writeFileSync(require('path').join(L.SHOTS, 'tester-words-' + T.tag + '.log'), '');
  await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; ZCore.onReport('*', (r, d) => d()); ZT.tick(70); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); ZCore.onReport('*', null); ZT.S.money = 200000; ZT.S.rp = 400; });
  const names = await page.evaluate(() => Object.keys(ZMenus.screens));
  say('screens:', names.join(' '));
  const data = await page.evaluate(() => ({ animal: ZT.S.animals[0] && ZT.S.animals[0].id, staff: ZT.S.staff[0] && ZT.S.staff[0].id, juv: (ZT.S.animals.find(a => ZE.isJuv(ZT.S, a)) || {}).id }));
  async function open(name, fn, wait) { try { await page.evaluate(fn); } catch (e) { T.find('open:' + name, 'could not open ' + name + ': ' + e.message.slice(0, 80)); return; } await sleep(wait || 350); const d = await describe(T); await T.shot('s-' + name); await L.invariants(T, name); say('  ' + name.padEnd(14), d.id || '-', '::', (d.text || '').replace(/\s*\|\s*/g, ' | ').slice(0, 150)); await page.evaluate(() => ZT.popAll()); await sleep(150); }
  for (const n of names) { if (['animal', 'staffer', 'newZoo'].includes(n)) continue; await open(n, "ZMenus.screens['" + n + "']()", 350); }
  if (data.animal) await open('animal-adult', 'ZMenus.screens.animal(' + data.animal + ')', 350);
  if (data.juv) await open('animal-baby', 'ZMenus.screens.animal(' + data.juv + ')', 350);
  if (data.staff) await open('staffer', 'ZMenus.screens.staffer(' + data.staff + ')', 350);
  // moments that can be opened directly
  await open('m-revealAnimal', "ZMoments.revealAnimal({ sp: 'lion', variant: 0, charm: 31, vigor: 22, wit: 40 }, { kicker: 'FOUND', isNew: true, hab: null })", 3800);
  await open('m-crate', "ZMoments.revealCrate({ animal: ZT.S.animals[0], rarity: 3, isNew: true, hab: null })", 5000);
  await open('m-train', "ZMoments.revealTrain(ZT.S.staff[0], { gain: 9, super: true, stat: 'care', value: 30 })", 600);
  await open('m-hire', "ZMoments.revealHire([{ name: 'Test One', role: 'explorer', lvl: 1, care: 10, sci: 11, exp: 12, charm: 13, wage: 80 }, { name: 'Test Two', role: 'vet', lvl: 1, care: 20, sci: 11, exp: 12, charm: 13, wage: 90 }])", 5000);
  await open('m-result', "ZMoments.result({ title: 'Result', lines: ['A line'], good: true, chips: [] })", 500);
  await open('m-caller-trader', "ZT.S.offers = ZT.S.offers; ZMoments.showCaller('trader')", 600);
  await open('m-caller-director', "ZMoments.showCaller('director')", 600);
  await open('m-caller-hh', "ZMoments.showCaller('headhunter')", 600);
  console.log('words log:'); console.log(require('fs').readFileSync(require('path').join(L.SHOTS, 'tester-words-' + T.tag + '.log'), 'utf8'));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
