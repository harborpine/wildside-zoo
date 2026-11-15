// Renderer: counts half-clear pixels inside the Artist's floor sprites at the game's density (headless). node test/render-alphaprobe.js
const path = require('path'), url = require('url'), pw = require('./pw.js');
(async () => {
  const b = await pw.chromium.launch({ headless: true }), page = await (await b.newContext()).newPage();
  await page.goto(url.pathToFileURL(path.join(__dirname, 'render-floor.html')).href); await page.waitForFunction('window.RT && RT.ready');
  const r = await page.evaluate(() => {
    const Z = ZSprites, out = {}, cnt = (name, s) => { if (!s || !s.c) return; const d = s.c.getContext('2d').getImageData(0, 0, s.c.width, s.c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && d[i] < 255) n++; if (n) out[name] = n; };
    ['grass', 'path', 'locked', 'water'].forEach(k => cnt('tile:' + k, Z.tile(k, 0))); ZD.BIOME_ORDER.forEach(bi => { cnt('tile:hab:' + bi, Z.tile('hab:' + bi, 0)); for (let e = 0; e < 6; e++) cnt('fence:' + bi + e, Z.fence(bi, e)); });
    ZD.FAC_ORDER.forEach(f => cnt('building:' + f, Z.building(f, {}))); cnt('entrance', Z.entrance());
    (Z.DECOS || []).forEach(k => cnt('deco:' + k, Z.deco(k, 0))); (Z.ICONS || []).forEach(k => cnt('icon:' + k, Z.icon(k)));
    ZD.SPECIES_LIST.forEach(sp => cnt('animal:' + sp.id, Z.animal(sp.id, {}))); (Z.PERSON_KINDS || []).forEach(k => cnt('person:' + k, Z.person(k, { seed: 1 })));
    return { density: Z.DENSITY, sprites: out };
  });
  console.log(JSON.stringify(r)); await b.close();
})();
