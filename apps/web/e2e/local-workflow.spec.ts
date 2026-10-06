import { test, expect } from './fixtures';
import { card, quantity, change, wanted, expectItem, addOwned, exportBackup, importText, persistedState, abortNextWrite, screenshotFullPage } from './workflow-helpers';
import cards from '../../../packages/catalog/data/cards.json' with { type: 'json' };
import manifest from '../../../packages/catalog/data/manifest.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'E1-01')).toBeVisible();
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
});

test('shows all 107 official cards in number order and the full catalog denominator', async ({ page }) => {
  expect(cards).toHaveLength(107);
  expect(manifest.sets.map((set) => set.count).sort((a, b) => a - b)).toEqual([22, 85]);
  await expect(page.locator('.inventory-card')).toHaveCount(107);
  await expect(page.locator('.inventory-card').first()).toHaveAttribute('data-testid', 'card-e1-01');
  await expect(page.locator('.scope-label')).toContainText('全公開カード · 107 種');
  await expect(page.getByRole('progressbar', { name: '全公開カードの所持種類率' })).toHaveAttribute('aria-valuemax', '107');
  const numbers = await page.locator('.inventory-card .card-number').allTextContents();
  expect(numbers).toEqual([...numbers].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true })));
  await expectItem(page, 'E1-01', 0, 0, false);
  await expectItem(page, 'E1-02', 0, 0, false);
  await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-01');
  await expect.poll(() => card(page, 'E1-01').getByRole('img').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await screenshotFullPage(page, '/tmp/aikatsu-full-desktop.png');
});

test('persists owned, offered, and wanted independently through IndexedDB reload', async ({ page }) => {
  await addOwned(page, 'E1-01', 2);
  await expect(quantity(page, 'E1-01', '譲れる枚数')).toHaveText('0枚');
  await change(page, 'E1-01', '譲れる枚数', '増やす').click();
  await expect(quantity(page, 'E1-01', '譲れる枚数')).toHaveText('1枚');
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  await wanted(page, 'E1-02').click();
  await expect(wanted(page, 'E1-02')).toBeChecked();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.reload();
  await expectItem(page, 'E1-01', 2, 1, true);
  await expectItem(page, 'E1-02', 0, 0, true);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});

test('requires confirmation to reduce offered inventory and preserves cancellation', async ({ page }) => {
  await expect(change(page, 'E1-01', '所持', '減らす')).toBeDisabled();
  await expect(change(page, 'E1-01', '譲れる枚数', '減らす')).toBeDisabled();
  await expect(change(page, 'E1-01', '譲れる枚数', '増やす')).toBeDisabled();
  await addOwned(page, 'E1-01', 1);
  await change(page, 'E1-01', '譲れる枚数', '増やす').click();
  await expect(quantity(page, 'E1-01', '譲れる枚数')).toHaveText('1枚');
  await expect(change(page, 'E1-01', '譲れる枚数', '増やす')).toBeDisabled();
  await change(page, 'E1-01', '所持', '減らす').click();
  const dialog = page.getByRole('dialog', { name: '譲れる枚数も調整しますか？' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('ともに 0 枚に変更します');
  await expectItem(page, 'E1-01', 1, 1, false);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.reload();
  await expectItem(page, 'E1-01', 1, 1, false);
  await change(page, 'E1-01', '所持', '減らす').click();
  await dialog.getByRole('button', { name: '調整して保存' }).click();
  await expect(dialog).not.toBeVisible();
  await expectItem(page, 'E1-01', 0, 0, false);
  await expect(change(page, 'E1-01', '所持', '減らす')).toBeDisabled();
  await page.reload();
  await expectItem(page, 'E1-01', 0, 0, false);
});

test('searches names and numbers and filters owned, unowned, offered, and wanted', async ({ page }) => {
  await addOwned(page, 'E1-01', 1);
  await change(page, 'E1-01', '譲れる枚数', '増やす').click();
  await expect(quantity(page, 'E1-01', '譲れる枚数')).toHaveText('1枚');
  await wanted(page, 'E1-02').click();
  await expect(wanted(page, 'E1-02')).toBeChecked();
  const search = page.getByRole('searchbox', { name: 'カード名・番号で検索' });
  await search.fill('キャミソール');
  await expect(card(page, 'E1-01')).toBeVisible();
  await expect(card(page, 'E1-02')).not.toBeVisible();
  await search.fill('e1-02');
  await expect(card(page, 'E1-02')).toBeVisible();
  await expect(card(page, 'E1-01')).not.toBeVisible();
  await search.fill('見つからない');
  await expect(page.getByText('一致するカードがありません')).toBeVisible();
  await search.fill('');
  const filter = page.getByRole('combobox', { name: 'カードの絞り込み' });
  for (const [value, number, count] of [['owned', 'E1-01', 1], ['unowned', 'E1-02', 106], ['offered', 'E1-01', 1], ['wanted', 'E1-02', 1]] as const) {
    await filter.selectOption(value);
    await expect(page.locator('.inventory-card')).toHaveCount(count);
    await expect(card(page, number)).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '107');
  }
  await page.getByRole('button', { name: '譲・求', exact: true }).click();
  const wishes = page.locator('.exchange-list').filter({ has: page.getByRole('heading', { name: /^求 · 欲しいカード/ }) });
  const offers = page.locator('.exchange-list').filter({ has: page.getByRole('heading', { name: /^譲 · 譲れるカード/ }) });
  await expect(wishes.locator('li')).toHaveCount(1);
  await expect(wishes).toContainText('E1-02');
  await expect(offers.locator('li')).toHaveCount(1);
  await expect(offers).toContainText('E1-01');
  await expect(offers).toContainText('×1枚');
});

test('keeps the previous UI and persisted snapshot when an IndexedDB write aborts', async ({ page }) => {
  await addOwned(page, 'E1-01', 1);
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  const before = await persistedState(page);
  await abortNextWrite(page);
  await change(page, 'E1-01', '所持', '増やす').click();
  await expect(page.getByRole('alert')).toContainText('保存できませんでした。変更は反映していません');
  await expectItem(page, 'E1-01', 1, 0, true);
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
  expect(await persistedState(page)).toEqual(before);
  await page.reload();
  await expectItem(page, 'E1-01', 1, 0, true);
  await expectItem(page, 'E1-02', 0, 0, false);
  expect(await persistedState(page)).toEqual(before);
});

test('exports JSON, rejects every invalid entry, and confirms complete replacement', async ({ page }) => {
  await addOwned(page, 'E1-01', 1);
  await wanted(page, 'E1-02').click();
  await expect(wanted(page, 'E1-02')).toBeChecked();
  const backup = await exportBackup(page);
  expect(backup.schemaVersion).toBe(2);
  expect(backup.inventory).toHaveLength(107);
  expect(new Set(backup.inventory.map((item) => item.cardId))).toEqual(new Set(cards.map((item) => item.id)));
  expect(backup.inventory.filter((item) => item.cardId === 'e1-01' || item.cardId === 'e1-02')).toEqual([
    { cardId: 'e1-01', owned: 1, offered: 0, wanted: false },
    { cardId: 'e1-02', owned: 0, offered: 0, wanted: true },
  ]);
  expect(backup.inventory.filter((item) => item.cardId !== 'e1-01' && item.cardId !== 'e1-02').every((item) => item.owned === 0 && item.offered === 0 && !item.wanted)).toBe(true);
  const valid = { ...backup, inventory: [
    { cardId: 'e1-01', owned: 3, offered: 1, wanted: true },
    { cardId: 'e1-02', owned: 2, offered: 0, wanted: false },
  ] };
  const invalidInputs = [
    ['malformed JSON', '{'],
    ['unsupported version', JSON.stringify({ ...valid, schemaVersion: 99 })],
    ['invalid second quantity', JSON.stringify({ ...valid, inventory: [valid.inventory[0], { ...valid.inventory[1], owned: -1 }] })],
    ['offered exceeds owned', JSON.stringify({ ...valid, inventory: [valid.inventory[0], { ...valid.inventory[1], offered: 3 }] })],
    ['duplicate card reference', JSON.stringify({ ...valid, inventory: [valid.inventory[0], valid.inventory[0]] })],
    ['unresolved card reference', JSON.stringify({ ...valid, inventory: [valid.inventory[0], { ...valid.inventory[1], cardId: 'unknown-card' }] })],
  ];
  for (const [name, text] of invalidInputs) {
    await test.step(name!, async () => {
      await importText(page, text!);
      await expect(page.getByRole('alert')).toContainText('データは変更していません');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      // Reload from IndexedDB: even the valid first entry must not apply.
      await page.reload();
      await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
      const preserved = await exportBackup(page);
      expect(preserved).toEqual(backup);
    });
  }
  await importText(page, JSON.stringify(valid));
  const dialog = page.getByRole('dialog', { name: 'バックアップを復元しますか？' });
  await expect(dialog).toContainText('5 枚');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await exportBackup(page)).toEqual(backup);
  await importText(page, JSON.stringify(valid));
  await dialog.getByRole('button', { name: '置き換えて復元' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('バックアップを復元し、端末内に保存しました');
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await expectItem(page, 'E1-01', 3, 1, true);
  await expectItem(page, 'E1-02', 2, 0, false);
  await page.reload();
  await expectItem(page, 'E1-01', 3, 1, true);
  await expectItem(page, 'E1-02', 2, 0, false);
});

test('keeps card and backup controls usable without horizontal overflow on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-01');
  await addOwned(page, 'E1-01', 1);
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => card(page, 'E1-01').getByRole('img').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await screenshotFullPage(page, '/tmp/aikatsu-full-mobile.png');
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'JSONをダウンロード' })).toBeVisible();
  await expect(page.getByLabel('バックアップJSONファイル')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
