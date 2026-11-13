const L = require('./tester-lib.js');
(async () => {
  for (const [w,h] of [[375,553],[320,568],[390,664]]) {
    const T = await L.launch('chromium', {width:w,height:h}); const p = T.page; await T.goto('');
    await T.tapText(/^1/, {sel:'button', wait:500}); await T.tapText(/^Next/, {sel:'button,.btn', wait:500}); await T.tapText(/^Yes/, {sel:'button,.btn', wait:900});
    await T.tapXY(Math.round(w/2), Math.round(h*0.55), 600);
    const m = await p.evaluate(()=>{const l=[...document.querySelectorAll('.layer:not([hidden])')].pop(); const b=l.querySelector('.pbody'); const c=document.querySelector('.mn-coach'); const g=l.querySelector('.grid'); return {scroll:b.scrollHeight>b.clientHeight+1, sh:b.scrollHeight, ch:b.clientHeight, coach: c&&Math.round(c.getBoundingClientRect().height), gridB: g&&Math.round(g.getBoundingClientRect().bottom), back:Math.round(l.querySelector('.back').getBoundingClientRect().top)};});
    console.log(w+'x'+h, JSON.stringify(m)); await T.shot('tutmenu'); await T.browser.close();
  }
})();
