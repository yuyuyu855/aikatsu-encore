import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export function exchangeFixture(wantedCount: number, offeredCount: number) {
  return [
    ...Array.from({ length: wantedCount }, (_, index) => ({ cardId: `e1-${String(index + 1).padStart(2, '0')}`, owned: 0, offered: 0, wanted: true })),
    ...Array.from({ length: offeredCount }, (_, index) => ({ cardId: `e1-${index + 51}`, owned: index % 3 + 1, offered: index % 3 + 1, wanted: false })),
  ];
}

export type DrawnText = { text: string; x: number; y: number };
export async function observeCanvasText(page: Page) {
  await page.evaluate(() => {
    const root = window as typeof window & { exchangeDraws: { text: string; x: number; y: number }[] };
    root.exchangeDraws = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      root.exchangeDraws.push({ text: args[0], x: args[1], y: args[2] });
      original.apply(this, args);
    };
  });
}

export async function downloadPng(page: Page, path: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('dialog', { name: '交換リスト画像', exact: true }).getByRole('link', { name: 'PNGを保存', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^exchange-\d+\.png$/);
  await download.saveAs(path);
  const png = await readFile(path);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(1360);
  expect(png.byteLength).toBeGreaterThan(20_000);
  return png;
}

export async function recordStore(page: Page, note: string, machineCount: number | null, favorite = true) {
  await page.getByRole('button', { name: 'お店', exact: true }).click();
  await page.getByRole('searchbox', { name: '店舗名・住所で検索' }).fill('GiGO中間');
  const store = page.locator('.store-card').filter({ has: page.getByRole('heading', { name: 'GiGO中間', exact: true }) });
  const star = store.getByRole('button', { name: /^GiGO中間をお気に入り/ });
  if ((await star.getAttribute('aria-pressed') === 'true') !== favorite) {
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', String(favorite));
  }
  await store.getByRole('button', { name: '記録する', exact: true }).click();
  await store.getByRole('textbox', { name: 'メモ', exact: true }).fill(note);
  await store.getByRole('spinbutton', { name: '設置台数（未確認なら空欄）' }).fill(machineCount === null ? '' : String(machineCount));
  await store.getByRole('button', { name: '保存する', exact: true }).click();
  await expect(store.getByRole('button', { name: '保存する', exact: true })).toHaveCount(0);
  await expect(store.locator('.store-count')).toHaveText(machineCount === null ? '設置台数：未確認' : `設置台数：${machineCount}台（自分の記録）`);
  if (note) await expect(store.locator('.store-note')).toHaveText(note);
  return store;
}
