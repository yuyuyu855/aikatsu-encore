import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

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
  return JSON.parse(await readFile(path!, 'utf8')) as {
    schemaVersion: number;
    inventory: { cardId: string; owned: number; offered: number; wanted: boolean }[];
  };
}

export async function importText(page: Page, text: string) {
  await page.getByLabel('バックアップJSONファイル').setInputFiles({
    name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(text),
  });
}
