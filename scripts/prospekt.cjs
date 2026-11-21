// Składa prospekt PDF z docs/prospekt/prospekt.html (zrzuty w docs/prospekt/zrzuty).
// Użycie: node scripts/prospekt.cjs
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '../docs/prospekt/prospekt.html'));
  await p.evaluate(() => document.fonts.ready);
  const out = path.resolve(__dirname, '../docs/prospekt/DIAGNOS-panel-CRM-prospekt.pdf');
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  // podgląd stron do kontroli układu
  if (process.env.PREVIEW) {
    await p.setViewportSize({ width: 794, height: 1123 });
    const n = await p.locator('.page').count();
    for (let i = 0; i < n; i++) await p.locator('.page').nth(i).screenshot({ path: path.join(process.env.PREVIEW, `strona-${i + 1}.png`) });
    for (let i = 0; i < n; i++) {
      const o = await p.locator('.page').nth(i).evaluate((el) => el.scrollHeight - el.clientHeight);
      console.log(`strona ${i + 1}: przepełnienie ${o}px`);
    }
  }
  console.log('zapisano', out);
  await b.close();
})();
