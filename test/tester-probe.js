const L = require('./tester-lib.js');
(async () => {
  const T = await L.launch('chromium'); const p = T.page; await T.goto();
  await p.evaluate(() => { ZCore.WEEK_MS[1]=ZCore.WEEK_MS[2]=600000; ZCore.onReport('*',(r,d)=>d()); ZT.tick(60); ZT.S.reports.length=0; ZT.S.happening=null; ZT.popAll(); ZT.S.money=500000; });
  const r0 = await p.evaluate(()=>ZT.S.rows); await T.tapXY(195,420); await T.tapText('Build'); await T.tapText(/^Buy land/);
  let d = await L.describe(T); console.log(d.id, d.text.slice(0,200), JSON.stringify(d.items)); await T.shot('x-land');
  await T.tapText(/^(Buy|Yes|Confirm)/i,{wait:600}); console.log('rows', r0, '->', await p.evaluate(()=>ZT.S.rows), JSON.stringify(await T.state()));
  await L.invariants(T,'land'); console.log(T.findings.map(f=>f.msg));
  await T.browser.close();
})();
