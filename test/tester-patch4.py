import re
p='test/tester-play.js'; s=open(p,encoding='utf8').read()
helper = r"""  // walk a planner: tap the first row on each screen until the green start button shows (steps may be skipped by the game)
  async function through(startRe, pre) {
    for (let i = 0; i < 6; i++) {
      const has = await T.locate(startRe, { sel: 'button, .btn' });
      if (has && !/Back|Play/.test(has.text)) { await T.shot(pre + '-confirm'); await inv(pre + ' confirm'); return true; }
      const d = await describe(T); await shotOnce(pre + '-step' + i + '-' + d.id, pre + '-step' + i); await inv(pre + ' step ' + i);
      if (!(await T.tapText(/./, { sel: '.row.tappable' }))) return false;
    }
    return false;
  }
"""
s=s.replace("  /* ================= START ================= */", helper+"  /* ================= START ================= */",1)
# expedition
a=s.index("    await T.shot('exp-where'); await inv('exp region');"); b=s.index("    const before = await page.evaluate(() => ZT.S.projects.length);\n    await T.tapText(/^Send/")
s=s[:a]+"    await through(/^Send/, 'exp'); await T.tapText(/Standard/); await T.shot('exp-confirm-standard');\n"+s[b:]
# event
a=s.index("    await T.tapText(/./, { sel: '.row.tappable' }); await T.shot('event-theme');"); b=s.index("    const n0 = await page.evaluate(() => ZT.S.projects.length);\n    const sd = await describe(T); say('  event confirm screen:'")
s=s[:a]+"    await through(/^Start/, 'event');\n"+s[b:]
a=s.index("    await T.tapText(/./, { sel: '.row.tappable' }); await T.shot('breed-lead');"); b=s.index("    const n0 = await page.evaluate(() => ZT.S.projects.length);\n    const sd = await describe(T); say('  breed confirm:'")
s=s[:a]+"    await through(/^Start/, 'breed');\n"+s[b:]
# Done/Cancel
s=s.replace("await T.tapText('Cancel', { floor: true, sel: '#placement-bar button'","await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button'")
s=s.replace("await T.tapText('Cancel', { floor: true, sel: '#placement-bar button', wait: 600 })","await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button', wait: 600 })")
open(p,'w',encoding='utf8').write(s)
