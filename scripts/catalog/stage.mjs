import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOfficialHtml, sha256, diffRecords } from './official.mjs';
import { getOfficial, closeNetwork } from './network.mjs';

const { values } = parseArgs({ options: {
  url: { type: 'string' }, 'set-id': { type: 'string' }, label: { type: 'string' },
  html: { type: 'string' }, out: { type: 'string', default: 'catalog-staging' },
} });
try {
  if (!values.url || !values['set-id'] || !values.label) throw new Error('Usage: pnpm catalog:stage --url <official series URL> --set-id <stable internal ID> --label <set name> [--html <saved HTML>] [--out <staging directory>]');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(values['set-id'])) throw new Error('Invalid internal set ID');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const catalogPath = path.join(root, 'packages/catalog/data');
  const [cards, manifest] = await Promise.all(['cards.json', 'manifest.json'].map(async (name) => JSON.parse(await readFile(path.join(catalogPath, name), 'utf8'))));
  const previousSet = manifest.sets.find((set) => set.id === values['set-id']);
  const response = values.html ? { bytes: await readFile(values.html), acquiredAt: new Date().toISOString(), url: values.url, input: 'saved HTML' } : await getOfficial(values.url, 'list');
  const parsed = parseOfficialHtml(response.bytes.toString ? Buffer.from(response.bytes).toString('utf8') : '', values.url);
  if (previousSet && previousSet.sourceSeriesId !== parsed.seriesId) throw new Error('Existing set ID belongs to another official series');
  const candidate = {
    setId: values['set-id'], name: values.label, sourceUrl: values.url, acquiredAt: response.acquiredAt,
    sourceSha256: sha256(response.bytes), sourceBytes: response.bytes.length, input: response.input ?? 'official HTTP GET',
    ...parsed, diff: diffRecords(parsed.records, cards, values['set-id']),
    imageAcquisition: 'not fetched; image hashes and dimensions require separate verification before promotion',
  };
  await mkdir(values.out, { recursive: true });
  await writeFile(path.join(values.out, `${values['set-id']}.candidate.json`), JSON.stringify(candidate, null, 2) + '\n');
  console.log(`Staged ${parsed.records.length} records. Added ${candidate.diff.added.length}, changed ${candidate.diff.changed.length}, missing ${candidate.diff.missing.length}.`);
  console.log('Review the candidate and verify images before updating tracked data. No catalog or inventory was changed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await closeNetwork(); }
