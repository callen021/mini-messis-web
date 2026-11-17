// Crop the step photos of a practice-library item out of its source sheet and write them as WebP
// (D123). Nothing under practice-library/ is committed: the source sheets and the crops stay on
// this machine, the crops are uploaded to the `practice-library` storage bucket.
//
//   node scripts/crop-practice-images.mjs
//
// The crops keep the source's own pixels (no upscaling). The browser that ships with Playwright
// does the decoding and the WebP encoding, so no image library is needed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One entry per sheet: where it is, where the crops go, and the photo rectangles [x, y, w, h]. */
const SHEETS = [
  {
    source: 'practice-library/source/First Touch.jpg',
    out: 'practice-library/out/first-touch',
    crops: [
      { name: 'step-1.webp', rect: [18, 266, 368, 284] },
      { name: 'step-2.webp', rect: [404, 266, 362, 284] },
      { name: 'step-3.webp', rect: [783, 266, 351, 284] },
      { name: 'step-4.webp', rect: [1150, 266, 368, 284] },
    ],
  },
];
const QUALITY = 0.86;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const sheet of SHEETS) {
  const bytes = await readFile(path.join(root, sheet.source));
  const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  await mkdir(path.join(root, sheet.out), { recursive: true });
  for (const crop of sheet.crops) {
    const b64 = await page.evaluate(
      async ({ src, rect, quality }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const [x, y, w, h] = rect;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
        return canvas.toDataURL('image/webp', quality).split(',')[1];
      },
      { src: dataUrl, rect: crop.rect, quality: QUALITY },
    );
    const file = path.join(root, sheet.out, crop.name);
    const buf = Buffer.from(b64, 'base64');
    await writeFile(file, buf);
    console.log(
      `${path.relative(root, file)}  ${crop.rect[2]}×${crop.rect[3]}  ${(buf.length / 1024).toFixed(1)} kB`,
    );
  }
}
await browser.close();
