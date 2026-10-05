import type { Page } from '@playwright/test';
import cards from '../../../packages/catalog/data/cards.json' with { type: 'json' };
import manifest from '../../../packages/catalog/data/manifest.json' with { type: 'json' };
import { test, expect } from './fixtures';
import { card, quantity, change, wanted, expectItem, addOwned, exportBackup, importText } from './workflow-helpers';

const legacyBackup = { schemaVersion: 1, inventory: [
  { cardId: 'e1-01', owned: 2, offered: 1, wanted: true },
  { cardId: 'e1-02', owned: 0, offered: 0, wanted: true },
] };
const firstSet = manifest.sets.find((set) => set.sourceSeriesId === '629001')!;
const promoSet = manifest.sets.find((set) => set.sourceSeriesId === '629901')!;

/** Seed the actual old database before loading any application JavaScript. */
async function openWithLegacyData(page: Page) {
  await page.route('**/__legacy-seed', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Legacy data seed</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">' }));
  await page.goto('/__legacy-seed');
  await page.evaluate((backup) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('aikatsu-encore-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put(backup, 'inventory');
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => reject(transaction.error);
    };
  }), legacyBackup);
  await page.unroute('**/__legacy-seed');
  await page.goto('/');
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
}

async function expectLoadedImage(page: Page, number: string, side: '表面' | '裏面', width: number, height: number) {
  const image = card(page, number).getByRole('img', { name: `${number} のカード${side}` });
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([width, height]);
  await expect(image).toHaveAttribute('src', /^\/cards\/[A-Za-z0-9_-]+\.webp$/);
}

test.beforeEach(async ({ page }) => { await openWithLegacyData(page); });

test('opens the real two-card schema-1 database without losing legacy inventory', async ({ page }) => {
  expect(firstSet.count).toBe(85);
  expect(promoSet.count).toBe(22);
  expect(new Set(cards.map((entry) => entry.id)).size).toBe(107);
  await expect(page.locator('.inventory-card')).toHaveCount(107);
  await expectItem(page, 'E1-01', 2, 1, true);
  await expectItem(page, 'E1-02', 0, 0, true);
  await expectItem(page, 'E1-03', 0, 0, false);
  const backup = await exportBackup(page);
  expect(backup.schemaVersion).toBe(1);
  expect(backup.inventory).toHaveLength(107);
  expect(new Set(backup.inventory.map((item) => item.cardId))).toEqual(new Set(cards.map((entry) => entry.id)));
  expect(backup.inventory.filter((item) => legacyBackup.inventory.some((old) => old.cardId === item.cardId))).toEqual(legacyBackup.inventory);
  expect(backup.inventory.filter((item) => !legacyBackup.inventory.some((old) => old.cardId === item.cardId))
    .every((item) => item.owned === 0 && item.offered === 0 && !item.wanted)).toBe(true);
  await page.reload();
  await expectItem(page, 'E1-01', 2, 1, true);
  await expectItem(page, 'E1-02', 0, 0, true);
  await expectItem(page, 'E1-03', 0, 0, false);
});

test('keeps all inventory when changing sets, searches, and metadata filters', async ({ page }) => {
  const scope = page.getByRole('combobox', { name: '収録範囲' });
  await scope.selectOption(promoSet.id);
  await expect(page.locator('.inventory-card')).toHaveCount(22);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '22');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await addOwned(page, 'EP-001', 1);
  await change(page, 'EP-001', '譲れる枚数', '増やす').click();
  await expect(quantity(page, 'EP-001', '譲れる枚数')).toHaveText('1枚');
  await wanted(page, 'EP-001').click();
  await expect(wanted(page, 'EP-001')).toBeChecked();
  await scope.selectOption(firstSet.id);
  await expect(page.locator('.inventory-card')).toHaveCount(85);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '85');
  await expectItem(page, 'E1-01', 2, 1, true);
  await expect(card(page, 'E1-01').locator('.card-source')).toContainText('トップス · Angely Sugar · AP 1,100');
  await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-01');
  await page.getByRole('combobox', { name: 'レアリティ' }).selectOption('N');
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '85');
  await page.getByRole('combobox', { name: 'レアリティ' }).selectOption('PR');
  await expect(page.locator('.inventory-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'パーツ' }).selectOption({ label: 'ボトムス' });
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'パーツ' }).selectOption({ label: 'トップス' });
  await page.getByRole('combobox', { name: 'カードの絞り込み' }).selectOption('owned');
  await expect(page.locator('.inventory-card')).toHaveCount(1);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '85');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  // Backup is complete even while only one first-set card is visible.
  const backup = await exportBackup(page);
  expect(backup.inventory).toHaveLength(107);
  expect(backup.inventory.find((item) => item.cardId === 'e1-01')).toEqual(legacyBackup.inventory[0]);
  expect(backup.inventory.find((item) => item.cardId === 'e1-02')).toEqual(legacyBackup.inventory[1]);
  expect(backup.inventory.find((item) => item.cardId === 'ep-001')).toEqual({ cardId: 'ep-001', owned: 1, offered: 1, wanted: true });
  await page.reload();
  await expectItem(page, 'E1-01', 2, 1, true);
  await scope.selectOption(promoSet.id);
  await expectItem(page, 'EP-001', 1, 1, true);
  expect(await exportBackup(page)).toEqual(backup);
});

test('reviews and restores an older two-entry backup across the entire expanded catalog', async ({ page }) => {
  await page.getByRole('combobox', { name: '収録範囲' }).selectOption(promoSet.id);
  await addOwned(page, 'EP-001', 1);
  await wanted(page, 'EP-001').click();
  await expect(wanted(page, 'EP-001')).toBeChecked();
  const before = await exportBackup(page);
  await importText(page, JSON.stringify(legacyBackup));
  const dialog = page.getByRole('dialog', { name: 'バックアップを復元しますか？' });
  await expect(dialog).toContainText('全登録 107 種');
  await expect(dialog).toContainText('ファイルにないカードは未所持・譲0枚・欲しい未選択');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await exportBackup(page)).toEqual(before);
  await importText(page, JSON.stringify(legacyBackup));
  await dialog.getByRole('button', { name: '置き換えて復元' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await expectItem(page, 'EP-001', 0, 0, false);
  await page.reload();
  await expectItem(page, 'E1-01', 2, 1, true);
  await expectItem(page, 'E1-02', 0, 0, true);
  await expectItem(page, 'EP-001', 0, 0, false);
  const restored = await exportBackup(page);
  expect(restored.inventory).toHaveLength(107);
  expect(restored.inventory.filter((item) => item.cardId !== 'e1-01' && item.cardId !== 'e1-02')
    .every((item) => item.owned === 0 && item.offered === 0 && !item.wanted)).toBe(true);
});

test('loads local front and back images for first-set, promotion, and landscape cards', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'カード名・番号で検索' });
  for (const [number, width, height] of [['E1-01', 460, 670], ['EP-001', 460, 670], ['E1-04', 670, 460]] as const) {
    await search.fill(number);
    await expectLoadedImage(page, number, '表面', width, height);
    await card(page, number).getByRole('button', { name: `${number} カードの裏面を表示` }).click();
    await expectLoadedImage(page, number, '裏面', width, height);
    await expectItem(page, number, number === 'E1-01' ? 2 : 0, number === 'E1-01' ? 1 : 0, number === 'E1-01');
  }
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe('intentional local image failure', () => {
  const missingImage = cards.find((entry) => entry.id === 'ep-001')!.imageUrl;
  test.use({ expectedImageFailures: [missingImage] });

  test('keeps the number and inventory usable when an image cannot load', async ({ page }) => {
    await page.route(`**${missingImage}`, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Intentional image failure for fallback verification' }));
    await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('EP-001');
    await card(page, 'EP-001').scrollIntoViewIfNeeded();
    await expect(card(page, 'EP-001').getByText('画像を表示できません')).toBeVisible();
    await expect(card(page, 'EP-001').locator('.card-image-fallback')).toContainText('EP-001');
    await addOwned(page, 'EP-001', 1);
    await expectItem(page, 'EP-001', 1, 0, false);
    await card(page, 'EP-001').getByRole('button', { name: 'EP-001 カードの裏面を表示' }).click();
    await expectLoadedImage(page, 'EP-001', '裏面', 460, 670);
  });
});
