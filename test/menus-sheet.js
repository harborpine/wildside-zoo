/* Menus: puts several screenshots side by side so they can be looked at in one go.  Usage: node test/menus-sheet.js out-name shot1 shot2 ... (names without menus- prefix or .png) */
const path = require('path'), fs = require('fs'), pw = require('./pw.js');
const SHOTS = path.join(__dirname, 'shots');
(async () => {
  const [out, ...names] = process.argv.slice(2);
  const imgs = names.map(n => 'file:///' + path.join(SHOTS, 'menus-' + n + '.png').replace(/\\/g, '/'));
  const html = '<body style="margin:0;background:#222;display:flex;gap:6px;padding:6px">' + imgs.map(s => '<img src="' + s + '" style="width:390px">').join('') + '</body>';
  const f = path.join(SHOTS, 'sheet-tmp.html'); fs.writeFileSync(f, html);
  const b = await pw.chromium.launch(), p = await b.newPage({ viewport: { width: 6 + names.length * 396, height: 850 } });
  await p.goto('file:///' + f.replace(/\\/g, '/')); await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: path.join(SHOTS, 'menus-sheet-' + out + '.png') }); await b.close(); fs.unlinkSync(f);
})();
