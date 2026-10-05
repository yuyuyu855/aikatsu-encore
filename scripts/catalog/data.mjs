import { officialUrl } from './official.mjs';

const fail = (message) => { throw new Error(message); };
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = (value) => text(value) && Number.isFinite(Date.parse(value));
function unique(values, label) {
  if (values.some((value) => !text(value)) || new Set(values).size !== values.length) fail(`Invalid or duplicate ${label}`);
}

export function validateCatalogData(cards, manifest, images, labels = {}) {
  if (!Array.isArray(cards) || cards.length === 0 || !Array.isArray(images) || !Array.isArray(manifest?.sets)) fail('Missing catalog arrays');
  if (cards.some((card) => !card || !text(card.id) || !text(card.number) || !text(card.name) || !text(card.setId) || !text(card.sourceKey) || !text(card.rarity))) fail('Missing required card fields');
  unique(cards.map((card) => card.id), 'card IDs');
  unique(manifest.sets.map((set) => set.id), 'set IDs');
  unique(manifest.sets.map((set) => set.sourceSeriesId), 'source series IDs');
  for (const card of cards) {
    if (!['active', 'retired'].includes(card.status)) fail(`Invalid card status: ${card.id}`);
    if (!card.metadata || ['name', 'part', 'brand', 'category', 'availabilityText'].some((key) => card.metadata[key] !== null && !text(card.metadata[key]))) fail(`Invalid raw metadata: ${card.id}`);
    officialUrl(card.source?.url);
    if (!date(card.source.acquiredAt) || !text(card.source.sourceSeriesId)) fail(`Invalid card provenance: ${card.id}`);
    const set = manifest.sets.find((set) => set.id === card.setId);
    if (!set || set.sourceSeriesId !== card.source.sourceSeriesId) fail(`Unresolved card set: ${card.id}`);
  }
  for (const set of manifest.sets) {
    officialUrl(set.sourceUrl);
    if (!text(set.name) || !date(set.fetchedAt) || !hash(set.sourceSha256) || !positive(set.sourceBytes)) fail(`Invalid set provenance: ${set.id}`);
    if (!['available', 'unpublished'].includes(set.sourceStatus) || !['complete', 'partial', 'unimported'].includes(set.coverageStatus)) fail(`Invalid coverage: ${set.id}`);
    if (!Array.isArray(set.cardIds) || set.count !== set.cardIds.length) fail(`Set count mismatch: ${set.id}`);
    unique(set.cardIds, `set card IDs: ${set.id}`);
    for (const id of set.cardIds) if (!cards.some((card) => card.id === id)) fail(`Unknown display card: ${id}`);
    if (set.coverageStatus === 'complete' && set.count === 0) fail('A complete set must not be empty');
  }
  if (images.some((image) => !image || !text(image.id))) fail('Invalid image records');
  unique(images.map((image) => image.id), 'image IDs');
  unique(images.map((image) => image.localUrl), 'image paths');
  for (const image of images) {
    officialUrl(image.sourceUrl, 'image');
    if (!/^\/cards\/[A-Za-z0-9_.-]+\.webp$/.test(image.localUrl) || image.localUrl.includes('..')) fail('Unsafe image cache path');
    if (image.format !== 'webp' || image.contentType !== 'image/webp' || !positive(image.bytes) || !positive(image.width) || !positive(image.height) || !hash(image.sha256) || !date(image.acquiredAt)) fail(`Invalid image provenance: ${image.id}`);
    if (!['front', 'back'].includes(image.side) || !cards.some((card) => card.id === image.cardId)) fail(`Unresolved image: ${image.id}`);
  }
  for (const card of cards) for (const side of ['front', 'back']) {
    const matching = images.filter((image) => image.cardId === card.id && image.side === side);
    if (matching.length !== 1 || matching[0].localUrl !== card[side === 'front' ? 'imageUrl' : 'imageBackUrl']) fail(`Image correspondence mismatch: ${card.id} ${side}`);
  }
  const release = manifest.release;
  if (!release || !text(release.catalogVersion) || !date(release.acquiredAt) || !text(release.rightsNotice) || !Array.isArray(release.sourceUrls)) fail('Invalid catalog release');
  release.sourceUrls.forEach((url) => officialUrl(url));
  if (release.totalCards !== cards.length || release.totalImages !== images.length || release.totalImageBytes !== images.reduce((sum, image) => sum + image.bytes, 0)) fail('Release totals mismatch');
  if (!labels || Array.isArray(labels) || typeof labels !== 'object') fail('Invalid label overlay');
  for (const [id, label] of Object.entries(labels)) {
    if (!cards.some((card) => card.id === id) || !label || typeof label !== 'object') fail(`Unresolved label: ${id}`);
    for (const field of ['name', 'part', 'brand', 'category']) if (label[field] !== undefined && label[field] !== null && !text(label[field])) fail(`Invalid transcribed field: ${id} ${field}`);
    if (label.appealPoints !== undefined && label.appealPoints !== null && (!Number.isSafeInteger(label.appealPoints) || label.appealPoints < 0)) fail(`Invalid appeal points: ${id}`);
    const image = images.find((image) => image.cardId === id && image.side === 'front');
    if (!label.source || label.source.kind !== 'official-card-image' || label.source.method !== 'visual-transcription' || label.source.url !== image?.sourceUrl || label.source.sha256 !== image?.sha256 || !date(label.source.acquiredAt)) fail(`Invalid label image provenance: ${id}`);
    if (!Array.isArray(label.verifiedFields) || !Array.isArray(label.uncertainFields)) fail(`Missing transcription verification: ${id}`);
  }
  return { cards: cards.length, images: images.length, sets: manifest.sets.length };
}
