const L = require('./tester-lib.js');
(async () => {
  const T = await L.launch('chromium', {width:393,height:852}); const p = T.page; await T.goto('?play=1&standalone=1&inset=34');
  await T.tapXY(196,520,500); await T.tapText('System'); await T.tapText(/^How to play/);
  await p.evaluate(()=>{const b=document.querySelector('.layer:not([hidden]) .pbody'); b.scrollTop=b.scrollHeight;}); await L.sleep(300); await T.shot('r5-legend');
  console.log(await p.evaluate(()=>document.querySelector('.layer:not([hidden]) .pbody').innerText.replace(/\n+/g,' | ')));
  await T.tapText(/./,{sel:'.back'}); await T.tapText(/Screen check/i); console.log(JSON.stringify(await L.describe(T)).slice(0,400));
  await T.browser.close();
})();
