import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateCatalogData } from './data.mjs';
import { verifyImageBuffer } from './official.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({ options: { 'metadata-only': { type: 'boolean', default: false } } });
try {
  const [cards, manifest, images, labels] = await Promise.all(['cards.json', 'manifest.json', 'images.json', 'labels.json'].map(async (file) => JSON.parse(await readFile(path.join(root, 'packages/catalog/data', file), 'utf8'))));
  const result = validateCatalogData(cards, manifest, images, labels);
  if (!values['metadata-only']) for (const image of images) verifyImageBuffer(await readFile(path.join(root, 'apps/web/public', image.localUrl.slice(1))), image);
  console.log(`Catalog valid: ${result.cards} cards, ${result.sets} sets, ${result.images} image references; ${values['metadata-only'] ? 'image files not checked' : 'all local image hashes/bytes/WebP dimensions verified'}`);
} catch (error) { console.error(`Catalog validation failed: ${error.message}`); process.exitCode = 1; }
