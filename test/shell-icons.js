/* Draws the app icons (a pixel paw on a green field) in headless Chromium and writes icons/*.png. Run: node test/shell-icons.js */
const path = require('path'), fs = require('fs'); const { chromium } = require('./pw.js');
const OUT = path.resolve(__dirname, '..', 'icons'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const draw = (size, maskable) => p.evaluate(([size, maskable]) => {
    const N = 32, c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const u = size / N, R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x * u), Math.round(y * u), Math.ceil(w * u), Math.ceil(h * u)); };
    R(0, 0, N, N, '#4aa84a');                                   // field
    for (let y = 0; y < N; y += 4) for (let x = (y / 4 % 2) * 4; x < N; x += 8) R(x, y, 4, 2, '#58b84a');   // grass stripes
    if (!maskable) { R(0, 0, N, 2, '#4a3220'); R(0, N - 2, N, 2, '#4a3220'); R(0, 0, 2, N, '#4a3220'); R(N - 2, 0, 2, N, '#4a3220'); R(2, 2, N - 4, 1, '#8fd36f'); }
    const s = maskable ? 0.78 : 1, cx = N / 2, cy = N / 2 + 1;
    const P = (x, y, w, h, col) => R(cx + (x - 16) * s, cy + (y - 17) * s, w * s, h * s, col);
    const paw = (dx, dy, col) => {                              // main pad + four toes
      P(9 + dx, 16 + dy, 14, 3, col); P(8 + dx, 19 + dy, 16, 4, col); P(10 + dx, 23 + dy, 12, 3, col); P(12 + dx, 14 + dy, 8, 2, col);
      P(5 + dx, 9 + dy, 4, 5, col); P(4 + dx, 10 + dy, 6, 3, col); P(10 + dx, 4 + dy, 4, 6, col); P(9 + dx, 5 + dy, 6, 4, col);
      P(18 + dx, 4 + dy, 4, 6, col); P(17 + dx, 5 + dy, 6, 4, col); P(23 + dx, 9 + dy, 4, 5, col); P(22 + dx, 10 + dy, 6, 3, col);
    };
    paw(1, 1, '#2a4a1e'); paw(0, 0, '#fff4d6');                // shadow then paw
    return c.toDataURL('image/png').split(',')[1];
  }, [size, maskable]);
  for (const [name, size, m] of [['icon-180.png', 180, false], ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
    fs.writeFileSync(path.join(OUT, name), Buffer.from(await draw(size, m), 'base64')); console.log('wrote icons/' + name);
  }
  await b.close();
})();
