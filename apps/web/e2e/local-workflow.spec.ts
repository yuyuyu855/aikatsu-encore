import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const card = (page: Page, number: string) => page.getByRole('article', { name: new RegExp(`^${number} `) });
const quantity = (page: Page, number: string, kind: '所持' | '譲れる枚数') => card(page, number).getByLabel(`${number} ${kind}`, { exact: true });
const change = (page: Page, number: string, kind: '所持' | '譲れる枚数', direction: '増やす' | '減らす') => card(page, number).getByRole('button', { name: `${number} ${kind}を${direction}`, exact: true });
const wanted = (page: Page, number: string) => card(page, number).getByRole('checkbox', { name: `${number} 欲しい` });

async function expectItem(page: Page, number: string, owned: number, offered: number, isWanted: boolean) {
  await expect(quantity(page, number, '所持')).toHaveText(`${owned}枚`);
  await expect(quantity(page, number, '譲れる枚数')).toHaveText(`${offered}枚`);
  if (isWanted) await expect(wanted(page, number)).toBeChecked();
  else await expect(wanted(page, number)).not.toBeChecked();
}

async function addOwned(page: Page, number: string, total: number) {
  for (let owned = 1; owned <= total; owned++) {
    await change(page, number, '所持', '増やす').click();
    await expect(quantity(page, number, '所持')).toHaveText(`${owned}枚`);
  }
}

async function exportBackup(page: Page) {
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONをダウンロード' }).click();
  const download = await downloadPending;
  expect(download.suggestedFilename()).toMatch(/^encore-backup-.*\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as {
    schemaVersion: number;
    inventory: { cardId: string; owned: number; offered: number; wanted: boolean }[];
  };
}

async function importText(page: Page, text: string) {
  await page.getByLabel('バックアップJSONファイル').setInputFiles({
    name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(text),
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'E1-01')).toBeVisible();
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
});

test('shows the two sample cards in number order and a bounded catalog denominator', async ({ page }) => {
  await expect(page.locator('.inventory-card')).toHaveCount(2);
  await expect(page.locator('.inventory-card').first()).toHaveAttribute('data-testid', 'card-e1-01');
  await expect(page.locator('.inventory-card').last()).toHaveAttribute('data-testid', 'card-e1-02');
  await expect(page.locator('.scope-label')).toContainText(/サンプル.*2種/);
  await expect(page.getByRole('progressbar', { name: 'サンプル2種の所持種類率' })).toHaveAttribute('aria-valuemax', '2');
  await expectItem(page, 'E1-01', 0, 0, false);
  await expectItem(page, 'E1-02', 0, 0, false);
  await page.screenshot({ path: '/tmp/aikatsu-local-desktop.png', fullPage: true });
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
  for (const [value, number] of [['owned', 'E1-01'], ['unowned', 'E1-02'], ['offered', 'E1-01'], ['wanted', 'E1-02']]) {
    await filter.selectOption(value!);
    await expect(page.locator('.inventory-card')).toHaveCount(1);
    await expect(card(page, number!)).toBeVisible();
  }
  await page.getByRole('button', { name: '譲・求', exact: true }).click();
  await expect(page.locator('.inventory-card')).toHaveCount(2);
});

test('keeps the previous UI and persisted snapshot when an IndexedDB write aborts', async ({ page }) => {
  await addOwned(page, 'E1-01', 1);
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let abortNextWrite = true;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = original.apply(this, args);
      if (args[1] === 'readwrite' && abortNextWrite) {
        abortNextWrite = false;
        queueMicrotask(() => transaction.abort());
      }
      return transaction;
    };
  });
  await change(page, 'E1-01', '所持', '増やす').click();
  await expect(page.getByRole('alert')).toContainText('保存できませんでした。変更は反映していません');
  await expectItem(page, 'E1-01', 1, 0, true);
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
  await page.reload();
  await expectItem(page, 'E1-01', 1, 0, true);
  await expectItem(page, 'E1-02', 0, 0, false);
});

test('exports JSON, rejects every invalid entry, and confirms complete replacement', async ({ page }) => {
  await addOwned(page, 'E1-01', 1);
  await wanted(page, 'E1-02').click();
  await expect(wanted(page, 'E1-02')).toBeChecked();
  const backup = await exportBackup(page);
  expect(backup.schemaVersion).toBe(1);
  expect(backup.inventory).toEqual([
    { cardId: 'e1-01', owned: 1, offered: 0, wanted: false },
    { cardId: 'e1-02', owned: 0, offered: 0, wanted: true },
  ]);
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
  await addOwned(page, 'E1-01', 1);
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/aikatsu-local-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'JSONをダウンロード' })).toBeVisible();
  await expect(page.getByLabel('バックアップJSONファイル')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
