import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { imageSize } from 'image-size';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function officialUrl(value, kind = 'list') {
  const url = new URL(value);
  const prefix = kind === 'image' ? '/encore/images/cardlist/card/' : '/encore/cardlist/';
  if (url.protocol !== 'https:' || url.hostname !== 'dcd.aikatsu.com' || url.username || url.password || url.port || !url.pathname.startsWith(prefix)) {
    throw new Error('Expected an official HTTPS card source URL');
  }
  return url;
}

export function parseOfficialHtml(html, sourceUrl) {
  const url = officialUrl(sourceUrl);
  const $ = load(html);
  const countText = $('.cardResult__tit strong').first().text().trim();
  if (!/^\d+$/.test(countText)) throw new Error('Missing declared result count');
  const declaredCount = Number(countText);
  if (!Number.isSafeInteger(declaredCount) || declaredCount <= 0) throw new Error('Empty or invalid result count requires review');
  const seriesId = $('input[name="series"]').first().attr('value');
  if (!seriesId || seriesId !== url.searchParams.get('series')) throw new Error('Source series does not match the requested URL');
  const seriesOptions = $('input[name="series"]').first().parent().find('button[data-value]').toArray().map((node) => ({
    id: $(node).attr('data-value'), label: $(node).text().trim(),
  }));
  const keys = new Set();
  const records = $('[id^="cardModal-"]').toArray().map((node) => {
    const modal = $(node);
    const imageKey = modal.attr('id').slice('cardModal-'.length);
    const match = /^(.+)_([A-Z]+)$/.exec(imageKey);
    if (!match || keys.has(imageKey)) throw new Error(`Invalid or duplicate source key: ${imageKey}`);
    keys.add(imageKey);
    const [, cardNumber, rarity] = match;
    const record = { cardNumber, imageKey, rarity, name: null, type: null, category: null, brand: null,
      availabilityText: modal.find('.cardModal__infoTxt').toArray().map((p) => $(p).text().trim()).filter(Boolean).join('\n') || null };
    for (const side of ['front', 'back']) {
      const image = modal.find(`.cardModal__face--${side} .cardModal__img`);
      if (image.length !== 1 || !image.attr('src')) throw new Error(`Missing or ambiguous ${side} image: ${imageKey}`);
      record[side] = { sourceUrl: officialUrl(new URL(image.attr('src'), url).href, 'image').href, alt: image.attr('alt') ?? null };
    }
    return record;
  });
  if (records.length !== declaredCount) throw new Error(`Declared ${declaredCount} cards but found ${records.length}; no update applied`);
  return { seriesId, declaredCount, records, seriesOptions };
}

/** Existing IDs win over source names, rarity and asset filename changes. */
export function assignStableIds(records, setId, registry = []) {
  const assigned = new Set();
  return records.map((record) => {
    const byKey = registry.filter((card) => card.setId === setId && card.sourceKey === record.imageKey);
    const byNumber = registry.filter((card) => card.setId === setId && card.number === record.cardNumber);
    const previous = byKey.length === 1 ? byKey[0] : byNumber.length === 1 ? byNumber[0] : undefined;
    if (!previous && byNumber.length > 1) throw new Error(`Ambiguous identity requires review: ${record.cardNumber}`);
    let id = previous?.id ?? record.cardNumber.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`New card ID needs a reviewed mapping: ${record.cardNumber}`);
    if (!previous && (registry.some((card) => card.id === id) || assigned.has(id))) id += `-${setId}-${record.rarity.toLowerCase()}`;
    if (assigned.has(id)) throw new Error(`Duplicate card identity: ${id}`);
    assigned.add(id);
    return { ...record, id };
  });
}

export function verifyImageBuffer(bytes, expected) {
  const result = imageSize(bytes);
  if (result.type !== 'webp' || result.width < 100 || result.height < 100) throw new Error('Expected a valid card WebP image');
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256 || result.width !== expected.width || result.height !== expected.height) {
    throw new Error(`Image size/hash/dimensions differ: ${expected.id}`);
  }
  return result;
}

export function diffRecords(records, registry, setId) {
  const next = assignStableIds(records, setId, registry);
  const ids = new Set(next.map((record) => record.id));
  return {
    added: next.filter((record) => !registry.some((card) => card.id === record.id)).map((record) => record.id),
    changed: next.filter((record) => {
      const old = registry.find((card) => card.id === record.id);
      return old && (old.number !== record.cardNumber || old.rarity !== record.rarity || old.sourceKey !== record.imageKey);
    }).map((record) => record.id),
    missing: registry.filter((card) => card.setId === setId && card.status !== 'retired' && !ids.has(card.id)).map((card) => card.id),
  };
}
