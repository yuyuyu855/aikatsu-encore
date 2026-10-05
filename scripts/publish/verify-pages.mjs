import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../../apps/web/dist-pages/', import.meta.url));
const files = [];
async function visit(parent) {
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    const file = path.join(parent, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'cards') throw new Error('Official image cache entered the public artifact');
      await visit(file);
    } else {
      if (/\.(webp|png|jpe?g|gif|avif)$/i.test(entry.name)) throw new Error('Unexpected image binary in public artifact');
      files.push(file);
    }
  }
}
await visit(directory);
const html = await readFile(path.join(directory, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="(\/aikatsu-encore\/assets\/[^"]+)"/g)].map((match) => match[1]);
if (references.length < 2) throw new Error('Pages JS/CSS references do not use the repository base path');
for (const reference of references) await readFile(path.join(directory, reference.slice('/aikatsu-encore/'.length)));
console.log(`Pages artifact verified: ${files.length} files, official image binaries 0, base /aikatsu-encore/`);
