// Upload the practice-library image crops to the LOCAL Supabase storage bucket (D123), so local
// runs show the real pictures. Run after `npx supabase start` (and again after a `db reset`,
// which empties the bucket):
//
//   node scripts/crop-practice-images.mjs
//   node scripts/upload-practice-images.mjs
//
// Local only, on purpose: the key comes from `supabase status` of the local stack and the script
// refuses any other address. On the hosted project the files are dragged into the
// `practice-library` bucket in the dashboard (keep the folder: first-touch/step-1.webp, …).
import { execSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'practice-library', 'out');
const BUCKET = 'practice-library';
const TYPES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

const raw = execSync('npx supabase status -o json', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const status = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const url = status.API_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error(`Refusing to upload: ${url || 'no API URL'} is not the local Supabase stack.`);
  process.exit(1);
}
const supabase = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let count = 0;
for (const dir of await readdir(OUT, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const name of await readdir(path.join(OUT, dir.name))) {
    const contentType = TYPES[path.extname(name).toLowerCase()];
    if (!contentType) continue;
    const object = `${dir.name}/${name}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(object, await readFile(path.join(OUT, dir.name, name)), { contentType, upsert: true });
    if (error) {
      console.error(`${object}: ${error.message}`);
      process.exit(1);
    }
    console.log(`uploaded ${BUCKET}/${object}`);
    count++;
  }
}
console.log(`${count} file${count === 1 ? '' : 's'} uploaded to ${url}`);
