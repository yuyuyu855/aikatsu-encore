import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from './fixtures';
import { card, change, wanted, quantity, expectItem, addOwned, exportBackup, screenshotFullPage } from '../workflow-helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL('http://127.0.0.1:4173/aikatsu-encore/');
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
});

test('loads the 107-card publishing artifact under the repository subpath without image files', async ({ page }) => {
  const directory = resolve('apps/web/dist-pages');
  const files = await readdir(directory, { recursive: true });
  expect(files.length).toBeGreaterThan(0);
  expect(files.filter((file) => /\.(?:webp|png|jpe?g|gif|avif)$/i.test(file))).toEqual([]);
  expect(files.some((file) => file === 'cards' || file.startsWith('cards/'))).toBe(false);
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  expect(html).toMatch(/src="\/aikatsu-encore\/assets\//);
  await expect(page.locator('.inventory-card')).toHaveCount(107);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '107');
  await expect(page.locator('.inventory-card img')).toHaveCount(0);
  await expect(card(page, 'E1-01').getByText('テスト公開では画像を掲載していません')).toBeVisible();
  await expect(card(page, 'E1-01').getByRole('link', { name: 'E1-01 カード表面の画像を開く' })).toHaveCount(0);
  await expect(card(page, 'E1-01').getByRole('button', { name: 'E1-01 カードの裏面を表示' })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-01');
  await screenshotFullPage(page, '/tmp/aikatsu-pages-desktop.png');
});

test('preserves edited inventory on reload and exports the full JSON backup from the subpath', async ({ page }) => {
  await addOwned(page, 'E1-01', 2);
  await change(page, 'E1-01', '譲れる枚数', '増やす').click();
  await expect(quantity(page, 'E1-01', '譲れる枚数')).toHaveText('1枚');
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  await page.reload();
  await expectItem(page, 'E1-01', 2, 1, true);
  await expectItem(page, 'E1-02', 0, 0, false);
  const backup = await exportBackup(page);
  expect(backup.schemaVersion).toBe(2);
  expect(backup.inventory).toHaveLength(107);
  expect(new Set(backup.inventory.map((item) => item.cardId)).size).toBe(107);
  expect(backup.inventory.find((item) => item.cardId === 'e1-01')).toEqual({ cardId: 'e1-01', owned: 2, offered: 1, wanted: true });
  expect(backup.inventory.find((item) => item.cardId === 'ep-001')).toEqual({ cardId: 'ep-001', owned: 0, offered: 0, wanted: false });
});

test('keeps set filters, card controls, and backup usable on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('combobox', { name: '収録範囲' }).selectOption('encore-promo');
  await expect(page.locator('.inventory-card')).toHaveCount(22);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '22');
  await page.getByRole('combobox', { name: '収録範囲' }).selectOption('encore-1');
  await expect(page.locator('.inventory-card')).toHaveCount(85);
  await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-01');
  await addOwned(page, 'E1-01', 1);
  await expectItem(page, 'E1-01', 1, 0, false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshotFullPage(page, '/tmp/aikatsu-pages-mobile.png');
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'JSONをダウンロード' })).toBeEnabled();
  await expect(page.getByLabel('バックアップJSONファイル')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
