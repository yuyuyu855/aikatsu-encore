import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { HistoryEvent, StorePreference } from '@aikatsu/domain';
import { expect } from './fixtures';

export interface CompleteBackup {
  schemaVersion: 2;
  inventory: { cardId: string; owned: number; offered: number; wanted: boolean }[];
  history: HistoryEvent[];
  storePreferences: StorePreference[];
}

export const card = (page: Page, number: string) => page.getByRole('article', { name: new RegExp(`^${number} `) });
export const quantity = (page: Page, number: string, kind: '所持' | '譲れる枚数') => card(page, number).getByLabel(`${number} ${kind}`, { exact: true });
export const change = (page: Page, number: string, kind: '所持' | '譲れる枚数', direction: '増やす' | '減らす') => card(page, number).getByRole('button', { name: `${number} ${kind}を${direction}`, exact: true });
export const wanted = (page: Page, number: string) => card(page, number).getByRole('checkbox', { name: `${number} 欲しい` });

export async function expectItem(page: Page, number: string, owned: number, offered: number, isWanted: boolean) {
  await expect(quantity(page, number, '所持')).toHaveText(`${owned}枚`);
  await expect(quantity(page, number, '譲れる枚数')).toHaveText(`${offered}枚`);
  if (isWanted) await expect(wanted(page, number)).toBeChecked();
  else await expect(wanted(page, number)).not.toBeChecked();
}

export async function addOwned(page: Page, number: string, total: number) {
  for (let owned = 1; owned <= total; owned++) {
    await change(page, number, '所持', '増やす').click();
    await expect(quantity(page, number, '所持')).toHaveText(`${owned}枚`);
  }
}

export async function exportBackup(page: Page) {
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONをダウンロード' }).click();
  const download = await downloadPending;
  expect(download.suggestedFilename()).toMatch(/^encore-backup-.*\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as CompleteBackup;
}

export async function importText(page: Page, text: string) {
  await page.getByLabel('バックアップJSONファイル').setInputFiles({
    name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(text),
  });
}

/** Compare all stores, including CAS revision, rather than only the rendered inventory. */
export async function persistedState(page: Page) {
  return page.evaluate(() => new Promise<{ state: Record<string, unknown>; events: unknown[]; storePreferences: unknown[] }>((resolve, reject) => {
    const request = indexedDB.open('aikatsu-encore-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['state', 'events', 'storePreferences'], 'readonly');
      const keys = transaction.objectStore('state').getAllKeys();
      const values = transaction.objectStore('state').getAll();
      const events = transaction.objectStore('events').getAll();
      const preferences = transaction.objectStore('storePreferences').getAll();
      transaction.oncomplete = () => {
        database.close();
        resolve({ state: Object.fromEntries(keys.result.map((key, index) => [String(key), values.result[index]])), events: events.result, storePreferences: preferences.result });
      };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
}

/** The real transaction still executes its writes, then aborts before commit. */
export async function abortNextWrite(page: Page) {
  await page.evaluate(() => {
    let abortNext = true;
    for (const method of ['put', 'add'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args) {
        const request = original.apply(this, args);
        if (this.transaction.mode === 'readwrite' && abortNext) {
          abortNext = false;
          const transaction = this.transaction;
          queueMicrotask(() => transaction.abort());
        }
        return request;
      };
    }
  });
}

/** Create a version-1 database before the upgraded application first runs. */
export async function seedLegacyInventory(page: Page, inventory: CompleteBackup['inventory']) {
  await page.route('**/__legacy-seed', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Legacy seed</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">',
  }));
  await page.goto('./__legacy-seed');
  await page.evaluate((items) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('aikatsu-encore-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put({ schemaVersion: 1, inventory: items }, 'inventory');
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), inventory);
  await page.unroute('**/__legacy-seed');
  await page.goto('./');
  await expect(change(page, 'E1-01', '所持', '増やす')).toBeEnabled();
}

export async function resetScreenshotScroll(page: Page) {
  await page.evaluate(() => {
    scrollTo(0, 0);
    return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

export async function screenshotFullPage(page: Page, path: string) {
  await resetScreenshotScroll(page);
  await page.screenshot({ path, fullPage: true });
}
