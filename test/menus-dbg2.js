/* Menus: debugging helper. node test/menus-dbg2.js : opens Projects with a campaign and a hiring advert running and prints captured errors. */
const path = require('path'), pw = require('./pw.js');
(async () => {
  const b = await pw.chromium.launch(), p = await b.newPage({ viewport: { width: 393, height: 852 } });
  await p.goto('file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html?play=1'); await p.waitForFunction(() => window.ZT && window.ZMenus); await new Promise(r => setTimeout(r, 500));
  await p.evaluate(() => { ZT.S.money = 900000; ZCore.act('runCampaign', 0); ZCore.act('advertise', 0); ZMenus.screens.projects(); }); await new Promise(r => setTimeout(r, 500));
  console.log(await p.evaluate(() => JSON.stringify(ZT.errors.slice(0, 3)))); await b.close();
})();
