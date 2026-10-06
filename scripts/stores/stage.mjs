// Manual official metadata refresh. Never runs in the application or on a schedule.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const sourceUrl = 'https://dcd.aikatsu.com/encore/pdf/shoplist.pdf';
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/stores/stage.mjs /tmp/stores-candidate.json [identity-map.json]');
const identityMap = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : {};
let previous;
try { previous = JSON.parse(await readFile(fileURLToPath(new URL('../../apps/web/src/features/stores/data/stores.json', import.meta.url)), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const pdf = execFileSync('curl', ['--silent', '--show-error', '--fail', '--location', '--max-time', '60', sourceUrl], { maxBuffer: 16 * 1024 * 1024 });
if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Official response is not a PDF');
const directory = await mkdtemp(join(tmpdir(), 'aikatsu-stores-'));
const pdfPath = join(directory, 'source.pdf');
await writeFile(pdfPath, pdf);
const sourceText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const date = sourceText.match(/※(\d{4})年(\d+)月(\d+)日時点/);
if (!date) throw new Error('Source date is missing; review the PDF layout');
const sourceAsOf = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
const stores = [];
const keys = new Set();
const ids = new Set();
for (const line of sourceText.split(/[\r\n\f]+/)) {
  if (!line.trim() || /取扱店舗一覧/.test(line) || /^\s*(※|店舗名)/.test(line)) continue;
  const parts = line.trim().split(/\s{2,}/);
  if (parts.length !== 4) throw new Error(`Unparsed official row: ${line}`);
  const [name, prefecture, address, phone] = parts;
  if (!/^(北海道|東京都|大阪府|京都府|.+県)$/.test(prefecture) || !address.startsWith(prefecture) || !/^[\d-]+$/.test(phone)) throw new Error(`Invalid official row: ${line}`);
  const identityKey = [prefecture, name, address].map(value => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).join('|');
  const id = identityMap[identityKey] ?? `official-${createHash('sha256').update(identityKey).digest('hex').slice(0, 16)}`;
  if (!/^official-[a-f0-9]{16}$/.test(id)) throw new Error(`Invalid identity mapping for ${name}`);
  if (keys.has(identityKey) || ids.has(id)) throw new Error(`Duplicate/colliding store identity: ${name}`);
  keys.add(identityKey); ids.add(id);
  stores.push({ id, name, prefecture, address, machineCount: null });
}
const prefectureCounts = Object.fromEntries([...new Set(stores.map(store => store.prefecture))].map(prefecture => [prefecture, stores.filter(store => store.prefecture === prefecture).length]));
if (Object.keys(prefectureCounts).length !== 47) throw new Error('Expected all 47 prefectures; review source changes before publishing');
const previousIds = new Set(previous?.stores.map(store => store.id) ?? []);
const addedIds = stores.filter(store => !previousIds.has(store.id)).map(store => store.id);
const retiredIds = previous?.stores.filter(store => !ids.has(store.id)).map(store => store.id) ?? [];
const snapshot = { sourceUrl, sourceAsOf, retrievedAt: new Date().toISOString(), sourceSha256: createHash('sha256').update(pdf).digest('hex'), total: stores.length, prefectureCounts, stores };
await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Staged ${stores.length} official stores across 47 prefectures, as of ${sourceAsOf}: ${destination}`);
console.log(`Identity review: ${addedIds.length} added IDs, ${retiredIds.length} retired IDs. Removed and added rows may be renamed/moved stores: supply reviewed identity mapping before replacement.`);
if (retiredIds.length || addedIds.length) await writeFile(`${destination}.identity-review.json`, `${JSON.stringify({ addedIds, retiredIds, identityMappings: identityMap }, null, 2)}\n`);
console.log('Review counts, removed/renamed stores, and identity mapping before replacing the checked-in snapshot.');
