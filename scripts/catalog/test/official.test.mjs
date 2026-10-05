import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOfficialHtml, assignStableIds, diffRecords, officialUrl, verifyImageBuffer } from '../official.mjs';
import { validateCatalogData } from '../data.mjs';

const url = 'https://dcd.aikatsu.com/encore/cardlist/?series=629001';
// Minimal structural fixture; no official images or full-page HTML are redistributed.
const modal = (key = 'E1-01_PR', front = '../images/cardlist/card/E1-01_PR.webp') => `<div id="cardModal-${key}"><div class="cardModal__face--front"><img class="cardModal__img" src="${front}"></div><div class="cardModal__face--back"><img class="cardModal__img" src="../images/cardlist/card/E1-01_PR_b.webp"></div><p class="cardModal__infoTxt">公式掲載の入手方法</p></div>`;
const html = (body = modal(), count = 1) => `<input name="series" value="629001"><p class="cardResult__tit">見つかったカード<strong>${count}</strong>枚</p>${body}`;
const registry = [{ id: 'e1-01', setId: 'encore-1', number: 'E1-01', sourceKey: 'E1-01_PR', rarity: 'PR', status: 'active' }];
const data = (name) => JSON.parse(readFileSync(new URL(`../../../packages/catalog/data/${name}.json`, import.meta.url), 'utf8'));

test('parses observed modal structure without inventing absent text metadata', () => {
  const result = parseOfficialHtml(html(), url);
  assert.equal(result.declaredCount, 1);
  assert.equal(result.records[0].cardNumber, 'E1-01');
  assert.equal(result.records[0].rarity, 'PR');
  assert.equal(result.records[0].name, null);
  assert.equal(result.records[0].availabilityText, '公式掲載の入手方法');
  assert.equal(result.records[0].back.sourceUrl, 'https://dcd.aikatsu.com/encore/images/cardlist/card/E1-01_PR_b.webp');
});
test('rejects empty, incomplete, duplicate and malformed candidate pages', () => {
  for (const value of [html('', 0), html(modal(), 2), html(modal() + modal(), 2), html(modal('broken')), html(modal().replace('cardModal__face--back', 'missing'))]) {
    assert.throws(() => parseOfficialHtml(value, url));
  }
});
test('rejects a different source series and external/insecure image URLs', () => {
  assert.throws(() => parseOfficialHtml(html(), url.replace('629001', '629901')));
  assert.throws(() => parseOfficialHtml(html(modal('E1-01_PR', 'http://dcd.aikatsu.com/encore/images/cardlist/card/a.webp')), url));
  assert.throws(() => officialUrl('https://example.com/encore/cardlist/'));
});
test('rarity and image-key corrections retain the old ID and report changed metadata', () => {
  const records = [{ cardNumber: 'E1-01', imageKey: 'E1-01_ER', rarity: 'ER' }];
  assert.equal(assignStableIds(records, 'encore-1', registry)[0].id, 'e1-01');
  assert.deepEqual(diffRecords(records, registry, 'encore-1'), { added: [], changed: ['e1-01'], missing: [] });
  assert.deepEqual(diffRecords([], registry, 'encore-1').missing, ['e1-01']);
  assert.equal(registry[0].status, 'active');
});
test('duplicate identities require review instead of silently overwriting inventory IDs', () => {
  const record = { cardNumber: 'E1-01', imageKey: 'E1-01_PR', rarity: 'PR' };
  assert.throws(() => assignStableIds([record, record], 'encore-1', registry));
});
test('current metadata validates; duplicates, wrong totals and broken image mapping fail', () => {
  const cards = data('cards'), manifest = data('manifest'), images = data('images');
  assert.deepEqual(validateCatalogData(cards, manifest, images, data('labels')), { cards: 107, sets: 2, images: 214 });
  assert.throws(() => validateCatalogData([...cards, cards[0]], manifest, images));
  assert.throws(() => validateCatalogData(cards, { ...manifest, release: { ...manifest.release, totalCards: 0 } }, images));
  assert.throws(() => validateCatalogData(cards, manifest, [{ ...images[0], cardId: 'unknown' }, ...images.slice(1)]));
  assert.throws(() => validateCatalogData(cards, manifest, [{ ...images[0], sha256: 'bad' }, ...images.slice(1)]));
});
test('an HTML error page cannot pass pinned image validation', () => {
  assert.throws(() => verifyImageBuffer(Buffer.from('<html>error</html>'), { bytes: 18, sha256: '0'.repeat(64), width: 460, height: 670 }));
});
