/* Artist: renders the pixel-density SAMPLE (feedback #4) with headless Chromium. Nothing in the game changes.
   It loads a private copy of sprites.js twice into test/art-density.html with the hi-res painter switched on
   (K = 1.5 for option B, K = 2 for option C), then saves:
     test/shots/art-density-sample.png   four phone-width columns (A today, B, C, D = C's grid with B's boldness) of the same zoo corner, at 3x
     test/shots/art-density-zoom.png     the lion and the snack stand enlarged in each option
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-density.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
function hdCopy(K, name, opts) {
  let s = fs.readFileSync(path.join(__dirname, '..', 'sprites.js'), 'utf8');
  const rep = (a, b, all) => { if (!s.includes(a)) throw new Error('sprites.js changed, cannot find: ' + a); s = all ? s.split(a).join(b) : s.replace(a, b); };
  rep("this.out = (pal && pal.O) || mix((pal && pal.A) || '#555555', '#1c1226', 0.8);", "this.out = (pal && pal.O) || mix((pal && pal.A) || '#555555', '#1c1226', 0.8); if (Pt.hd) Pt.hd(this);");
  rep('s.ay -= 1;', 's.ay -= (s.K || 1);', true);
  rep('function drawDeco(kind, seed) {', 'function drawDeco(kind, seed) { if (root.__decoD) { var d0 = root.__decoD(kind, seed, Pt, { rng: rng, mix: mix }); if (d0) return d0; }');
  rep('function drawPerson(sp, fr) {', 'function drawPerson(sp, fr) { if (root.__onPerson) root.__onPerson(sp, fr);');
  rep('root.ZSprites = ZS;', 'ZS._in = { Pt: Pt, SP: SP, quad: quad, trunked: trunked, spots: spots, h2: h2, rng: rng, GROUND: GROUND, BUILD: BUILD, box: box, hip: hip, stripes: stripes, Bp: Bp, fin: fin, IC: IC, ICON_DEFS: ICON_DEFS, birdFn: bird, STAFF: STAFF, visitorSpec: visitorSpec }; root.__ZSX = ZS;');
  return s + `\n;window.${name} = window.__ZSX; window.${name}._in.Pt.hd = makeHD(${K}, window.${name}, ${JSON.stringify(opts || {})});\n`;
}
module.exports = { hdCopy };
if (require.main === module) (async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-density.html').replace(/\\/g, '/'));
  await page.addScriptTag({ content: hdCopy(1.5, 'ZS_B') });
  await page.addScriptTag({ content: hdCopy(2, 'ZS_C') });
  await page.addScriptTag({ content: hdCopy(2, 'ZS_D', { bold: true, outline2: true }) });
  await page.evaluate('window.__go()');
  await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
  for (const [id, file] of [['sample', 'art-density-sample.png'], ['zoom', 'art-density-zoom.png']]) {
    const url = await page.evaluate(i => document.getElementById(i).toDataURL('image/png'), id);
    fs.writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved test/shots/' + file);
  }
  const e2 = await page.evaluate('window.__err');
  const all = errs.concat(e2);
  console.log(all.length ? 'PROBLEMS:\n  ' + all.slice(0, 10).join('\n  ') : 'no console errors');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
