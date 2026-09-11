// Cong cu do tam thoi: xuat PDF voi tung ban font to dam.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const S = process.argv[2];
const B = '.cv-name,.section-title,.project-sub,.pub-author-first,.edu-item .item-title,.project-item .item-title';
const browser = await chromium.launch();
for (const tag of process.argv.slice(3)) {
  const b64 = fs.readFileSync(path.join(S, `times-dam-m${tag}.woff2`)).toString('base64');
  const page = await browser.newPage();
  await page.emulateMedia({ media: 'print' });
  await page.goto(pathToFileURL(path.resolve('output/preview.html')).href, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content:
    `@font-face{font-family:"TD";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:400;font-style:normal}`
    + `${B}{font-family:"TD",serif;font-weight:400}` });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(process.env.TMP, `probe_m${tag}.pdf`), format: 'A4',
                   printBackground: true, preferCSSPageSize: true });
  await page.close();
}
await browser.close();
console.log('xong');
