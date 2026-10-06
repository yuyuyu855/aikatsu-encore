import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeEntries, exchangeText, exchangePageCount, exchangePage, renderExchangePng } from './export.ts';
const cards = Array.from({ length: 27 }, (_, i) => ({ id: `c${i}`, number: `E-${i}`, name: `カード${i}`, rarity: 'R', imageUrl: 'private.png' }));
const inventory = cards.map((card, i) => ({ cardId: card.id, owned: 3, offered: i < 13 ? 2 : 0, wanted: true }));
test('scoped lists use only offered and wanted fields without mutating input', () => {
  const original = JSON.stringify(inventory);
  const result = exchangeEntries(cards.slice(10, 15), inventory);
  assert.equal(result.wanted.length, 5); assert.equal(result.offered.length, 3);
  assert.equal(JSON.stringify(inventory), original);
});
test('asymmetric 27 wanted and 13 offered preserve every entry across three pages', () => {
  const { wanted, offered } = exchangeEntries(cards, inventory);
  assert.equal(exchangePageCount(wanted, offered), 3);
  assert.deepEqual([0, 1, 2].map((page) => exchangePage(wanted, page).length), [12, 12, 3]);
  assert.deepEqual([0, 1, 2].map((page) => exchangePage(offered, page).length), [12, 1, 0]);
  assert.deepEqual([0, 1, 2].flatMap((page) => exchangePage(wanted, page)), wanted);
});
test('Japanese text includes scope, all entries, quantities and attribution, excludes image paths', () => {
  const { wanted, offered } = exchangeEntries(cards, inventory);
  const text = exchangeText('全弾', wanted, offered);
  assert.match(text, /全弾/); assert.match(text, /【求】27種/); assert.match(text, /【譲】13種/);
  assert.match(text, /E-26 カード26 \[R\]/); assert.match(text, /E-12 カード12 \[R\] ×2枚/);
  assert.match(text, /公式カードリスト/); assert.ok(!text.includes('private.png'));
});
test('empty lists retain explicit sections and one preview page', () => {
  assert.equal(exchangePageCount([], []), 1); assert.match(exchangeText('空の弾', [], []), /【求】0種\nなし/);
});
test('PNG renderer draws metadata for selected page and requests PNG encoding and returns the encoder blob', async () => {
  const lines = []; const expectedBlob = new Blob(['png'], { type: 'image/png' });
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText(text) { lines.push(text); }, measureText: (text) => ({ width: text.length * 10 }) }), toBlob(callback, type) { assert.equal(type, 'image/png'); callback(expectedBlob); } }) };
  try {
    const { wanted, offered } = exchangeEntries(cards, inventory);
    assert.equal(await renderExchangePng('全弾', wanted, offered, 2), expectedBlob);
    assert.ok(lines.includes('E-26')); assert.ok(!lines.includes('E-0'));
    assert.ok(lines.includes('このページにはありません')); assert.ok(!lines.includes('private.png'));
  } finally { globalThis.document = oldDocument; }
});
