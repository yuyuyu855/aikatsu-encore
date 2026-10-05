import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOfficial, closeNetwork } from './network.mjs';
import { verifyImageBuffer } from './official.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const images = JSON.parse(await readFile(path.join(root, 'packages/catalog/data/images.json'), 'utf8'));
let reused = 0;
let downloaded = 0;
try {
  for (const image of images) {
    if (!/^\/cards\/[a-zA-Z0-9_.-]+\.webp$/.test(image.localUrl)) throw new Error('Unsafe local image path');
    const target = path.join(root, 'apps/web/public', image.localUrl.slice(1));
    try { verifyImageBuffer(await readFile(target), image); reused++; continue; } catch (error) {
      if (error?.code && error.code !== 'ENOENT') throw error;
    }
    const response = await getOfficial(image.sourceUrl, 'image');
    verifyImageBuffer(response.bytes, image);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    try {
      await writeFile(temporary, response.bytes, { flag: 'wx' });
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
    downloaded++;
    console.log(`Verified image ${downloaded + reused}/${images.length}`);
  }
  console.log(`Images ready: ${images.length}; downloaded ${downloaded}, reused ${reused}`);
} catch (error) {
  console.error(`Image acquisition stopped; existing catalog retained: ${error.message}`);
  process.exitCode = 1;
} finally { await closeNetwork(); }
