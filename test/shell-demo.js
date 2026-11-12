/* Sample screens that use every shell class. Loaded by index.html?demo=1. ZDemo.show(name) pushes one; ZDemo.names lists them. */
(function () {
  const Z = window.ZCore, ui = Z.ui, el = ui.el;
  function fake(color, n) { // small pixel picture used when ZSprites has no art yet
    const c = document.createElement('canvas'); c.width = 48; c.height = 48; const g = c.getContext('2d'); g.scale(4, 4);
    g.fillStyle = color; g.fillRect(2, 4, 8, 6); g.fillRect(8, 2, 3, 4); g.fillStyle = '#000'; g.fillRect(9, 3, 1, 1); g.fillRect(3, 10, 1, 2); g.fillRect(8, 10, 1, 2); return c.toDataURL();
  }
  const sp = (id, col) => { try { if (window.ZSprites && ZSprites.animalUrl) return ZSprites.animalUrl(id, {}, 3); } catch (e) { /* use fake */ } return fake(col); };
  const S = {
    grid() {
      Z.push({ id: 'demo-grid', title: 'Menu', backLabel: 'Play', render(body) {
        body.appendChild(ui.grid([
          { icon: 'm-projects', label: 'Projects', badge: true, onTap() {} }, { icon: 'm-build', label: 'Build', onTap() {} }, { icon: 'm-animals', label: 'Animals', badge: 3, onTap() {} },
          { icon: 'm-staff', label: 'Staff', onTap() {} }, { icon: 'm-research', label: 'Research', onTap() {} }, { icon: 'm-info', label: 'Info', onTap() {} },
          { icon: 'm-system', label: 'System', onTap() {} }
        ]));
      } });
    },
    list() {
      Z.push({ id: 'demo-list', title: 'Animals', render(body, api) {
        body.appendChild(ui.tabs(['Mine', 'Pen', 'For sale'], 'Mine', () => ui.toast('Tabs work')));
        body.appendChild(ui.list([
          { img: sp('zebra', '#ddd'), title: 'Zebra', sub: 'Savanna #1', chips: [ui.stat('Cha', 42, 'charm'), ui.stat('Vig', 37, 'vigor'), ui.stat('Wit', 25, 'wit')], right: [ui.stars(3, 5), ui.sign(3)], onTap: () => S.sub() },
          { img: sp('lion', '#d9a441'), title: 'Lion', sub: 'Savanna #1', chips: [ui.stat('Cha', 78, 'charm'), ui.stat('Vig', 61, 'vigor'), ui.stat('Wit', 49, 'wit')], right: [ui.flames(2), ui.sign(2)], onTap: () => S.sub() },
          { img: sp('giraffe', '#e8b84a'), title: 'Giraffe', sub: 'Resting', right: [ui.sign(0), ui.sign(null)], onTap: () => S.sub() }
        ]));
        body.appendChild(ui.section('Signs and stars'));
        body.appendChild(el('div', { cls: 'btnrow' }, [0, 1, 2, 3, null].map(l => ui.sign(l))));
        body.appendChild(el('div', {}, ui.stars(4, 10), ' ', ui.flames(1)));
      } });
    },
    sub() {
      Z.push({ id: 'demo-sub', title: 'Zebra', render(body) {
        body.appendChild(el('div', { cls: 'center' }, ui.img(sp('zebra', '#ddd'), { w: 72 })));
        body.appendChild(el('div', { cls: 'chips', style: { justifyContent: 'center' } }, ui.stat('Charm', 42, 'charm'), ui.stat('Vigor', 37, 'vigor'), ui.stat('Wit', 25, 'wit')));
        body.appendChild(ui.bar(0.6, { label: 'Fed' })); body.appendChild(ui.btn('Move to...', () => ui.toast('Sample button'), { cls: 'blue big', sub: 'costs nothing' }));
        body.appendChild(ui.btn('Sell', () => ui.confirm('Sell this zebra for $1,200?', () => ui.toast('Sold', 'good'), { danger: true, yes: 'Sell' }), { cls: 'danger big' }));
      } });
    },
    choice() {
      Z.push({ id: 'demo-choice', title: 'Fresh tracks!', modal: true, render(body, api) {
        body.appendChild(el('div', { cls: 'ctext' }, 'Your explorers found tracks of something rare.'));
        body.appendChild(ui.choices([
          { label: 'Follow them', note: 'Better find, may be late', odds: 0.45 }, { label: 'Hire a guide', note: 'Safer', cost: 1500, odds: 0.7 },
          { label: 'Use a rare map', costRp: 4, odds: 'Likely' }, { label: 'Too costly', cost: 999999, odds: 0.9 }, { label: 'Play safe', note: 'Carry on' }
        ], i => { api.pop(); ui.toast('Picked ' + (i + 1)); }));
      } });
    },
    reveal() {
      Z.push({ id: 'demo-reveal', modal: true, render(body, api) {
        const n = (body._n = (body._n || 0));
        body.appendChild(ui.reveal({ kicker: 'Expedition found', img: sp('lion', '#d9a441'), title: 'Lion', big: '★★★', sub: 'Rare! Charm 78', tone: 'rare', onTap: () => api.pop() }));
      } });
    },
    reveal2() {
      Z.push({ id: 'demo-reveal2', modal: true, render(body, api) {
        body.appendChild(ui.reveal({ kicker: 'Critic 3 of 4', title: 'Mr. Pebble', big: '9 / 10', sub: 'Lovely day out', tone: 'good', onTap: () => api.pop() }));
      } });
    },
    misc() {
      Z.push({ id: 'demo-misc', title: 'Parts', render(body) {
        body.appendChild(ui.section('Buttons'));
        body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Plain', () => ui.toast('Plain')), ui.btn('Go', () => ui.toast('Go', 'good'), { cls: 'primary' }), ui.btn('Blue', () => {}, { cls: 'blue' })));
        body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Warn', () => {}, { cls: 'warn' }), ui.btn('Delete', () => {}, { cls: 'danger' }), ui.btn('Off', () => {}, { disabled: true })));
        body.appendChild(ui.section('Progress'));
        body.appendChild(ui.bar(0.35)); body.appendChild(ui.bar(0.7, { cls: 'gold', label: 'Event 70%' })); body.appendChild(ui.bar(0.2, { cls: 'red' }));
        body.appendChild(ui.section('Note box'));
        body.appendChild(el('textarea', { cls: 'field', rows: 2, placeholder: 'Type a note...' }));
        body.appendChild(ui.note('Small help text sits here and stays short.'));
        body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Toast', () => ui.toast('A good thing happened', 'good')), ui.btn('Bad toast', () => ui.toast('Not enough money', 'bad'))));
        body.appendChild(ui.list([], { empty: 'Nobody is selling right now.' }));
      } });
    },
    confirm() { ui.confirm('Start a new zoo? The current one is replaced.', () => {}, { danger: true, yes: 'New zoo' }); },
    toast() { ui.toast('Saved', 'good'); ui.toast('Not enough money', 'bad'); },
    log() { Z.screens.log(); }
  };
  window.ZDemo = { names: Object.keys(S), show(n) { S[n](); } };
})();
