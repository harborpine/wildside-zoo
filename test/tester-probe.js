const L = require('./tester-lib.js');
(async () => {
  const T = await L.launch('chromium'); const p = T.page; await T.goto();
  await T.tapXY(195,420); await T.tapText('System'); await T.tapText(/^How to play/);
  await p.evaluate(()=>{const b=document.querySelector('.layer:not([hidden]) .pbody'); b.scrollTop=b.scrollHeight;}); await L.sleep(300); await T.shot('legend-bottom');
  console.log(await p.evaluate(()=>[...document.querySelectorAll('.layer:not([hidden]) .pbody')][0].innerText.replace(/\n+/g,' | ')));
  await T.browser.close();
})();
