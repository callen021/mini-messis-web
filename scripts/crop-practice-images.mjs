// Crop the step photos of a practice-library item out of its source sheet and write them as WebP
// (D123). Nothing under practice-library/ is committed: the source sheets and the crops stay on
// this machine, the crops are uploaded to the `practice-library` storage bucket.
//
//   node scripts/crop-practice-images.mjs
//
// The crops keep the source's own pixels (no upscaling); a crop with a `width` is scaled down to
// it, for a whole photo sized for a phone. The browser that ships with Playwright
// does the decoding and the WebP encoding, so no image library is needed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * One entry per sheet: where it is, where the crops go, and the photo rectangles [x, y, w, h].
 * `width` scales a crop down to that many pixels wide.
 */
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
  {
    source: 'practice-library/source/Win It and Keep It.jpg',
    out: 'practice-library/out/win-it-and-keep-it',
    crops: [
      { name: 'step-1.webp', rect: [18, 266, 368, 272] },
      { name: 'step-2.webp', rect: [402, 266, 362, 272] },
      { name: 'step-3.webp', rect: [780, 266, 356, 272] },
      { name: 'step-4.webp', rect: [1152, 266, 366, 272] },
    ],
  },
  {
    source: 'practice-library/source/Pass and Move.png',
    out: 'practice-library/out/passing-the-ball',
    crops: [
      { name: 'step-1.webp', rect: [16, 250, 284, 306] },
      { name: 'step-2.webp', rect: [314, 250, 266, 306] },
      { name: 'step-3.webp', rect: [594, 250, 266, 306] },
      { name: 'step-4.webp', rect: [874, 250, 272, 306] },
      { name: 'step-5.webp', rect: [1158, 250, 274, 306] },
    ],
  },
  {
    // the larger of the two seven-step sheets: same steps, bigger photos
    source: 'practice-library/source/Striking the Ball (7 steps, large).png',
    out: 'practice-library/out/striking-the-ball',
    crops: [
      { name: 'step-1.webp', rect: [16, 238, 196, 274] },
      { name: 'step-2.webp', rect: [226, 238, 198, 274] },
      { name: 'step-3.webp', rect: [438, 238, 192, 274] },
      { name: 'step-4.webp', rect: [646, 238, 184, 274] },
      { name: 'step-5.webp', rect: [844, 238, 184, 274] },
      { name: 'step-6.webp', rect: [1044, 238, 194, 274] },
      { name: 'step-7.webp', rect: [1254, 238, 178, 274] },
      { name: 'tip-1.webp', rect: [666, 768, 130, 190] },
      { name: 'tip-2.webp', rect: [810, 768, 146, 190] },
      { name: 'tip-3.webp', rect: [970, 768, 124, 190] },
    ],
  },
  {
    // a whole photo, one picture for all three levels (D142)
    source: 'practice-library/toe-taps.png',
    out: 'practice-library/out/toe-taps',
    crops: [{ name: 'drill.webp', rect: [0, 0, 1122, 1402], width: 1000 }],
  },
  {
    source: 'practice-library/tic-tocs.png',
    out: 'practice-library/out/inside-inside-touches',
    crops: [{ name: 'drill.webp', rect: [0, 0, 1448, 1086], width: 1000 }],
  },
  {
    source: 'practice-library/sole-rolls.png',
    out: 'practice-library/out/sole-rolls',
    crops: [{ name: 'drill.webp', rect: [0, 0, 1122, 1402], width: 1000 }],
  },
];
const QUALITY = 0.86;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const sheet of SHEETS) {
  const bytes = await readFile(path.join(root, sheet.source));
  const mime = sheet.source.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  await mkdir(path.join(root, sheet.out), { recursive: true });
  for (const crop of sheet.crops) {
    const made = await page.evaluate(
      async ({ src, rect, width, quality }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const [x, y, w, h] = rect;
        const canvas = document.createElement('canvas');
        canvas.width = width ?? w;
        canvas.height = width ? Math.round((h * width) / w) : h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
        return {
          b64: canvas.toDataURL('image/webp', quality).split(',')[1],
          w: canvas.width,
          h: canvas.height,
        };
      },
      { src: dataUrl, rect: crop.rect, width: crop.width ?? null, quality: QUALITY },
    );
    const file = path.join(root, sheet.out, crop.name);
    const buf = Buffer.from(made.b64, 'base64');
    await writeFile(file, buf);
    console.log(`${path.relative(root, file)}  ${made.w}×${made.h}  ${(buf.length / 1024).toFixed(1)} kB`);
  }
}
await browser.close();
