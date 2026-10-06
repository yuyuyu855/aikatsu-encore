import { test, expect } from './fixtures';
import { addOwned, change, quantity, expectItem, exportBackup, importText, persistedState, abortNextWrite } from './workflow-helpers';
import { recordStore } from './feature-helpers';

test('restores full metadata atomically while malformed metadata and aborted writes preserve every store', async ({ page }) => {
  await page.goto('/');
  await addOwned(page, 'E1-01', 1);
  await recordStore(page, '元の記録', 0);
  const restore = await exportBackup(page);
  expect(restore.schemaVersion).toBe(2);
  expect(restore.history).toHaveLength(3);
  expect(restore.storePreferences).toHaveLength(1);
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await change(page, 'E1-01', '所持', '増やす').click();
  await expect(quantity(page, 'E1-01', '所持')).toHaveText('2枚');
  await recordStore(page, '別の記録', 2);
  const current = await exportBackup(page);
  const snapshot = await persistedState(page);
  const invalid = [
    ['missing history', { ...restore, history: undefined }],
    ['invalid timestamp', { ...restore, history: [{ ...restore.history[0], occurredAt: 'not-a-date' }] }],
    ['duplicate history event', { ...restore, history: [restore.history[0], restore.history[0]] }],
    ['unknown historical card', { ...restore, history: [{ ...restore.history[0], changes: [{ kind: 'inventory', targetId: 'unknown-card', before: { cardId: 'unknown-card', owned: 0, offered: 0, wanted: false }, after: { cardId: 'unknown-card', owned: 1, offered: 0, wanted: false } }] }] }],
    ['invalid store count', { ...restore, storePreferences: [{ ...restore.storePreferences[0], machineCount: -1 }] }],
    ['oversized store note', { ...restore, storePreferences: [{ ...restore.storePreferences[0], note: 'x'.repeat(2001) }] }],
    ['duplicate store preference', { ...restore, storePreferences: [restore.storePreferences[0], restore.storePreferences[0]] }],
  ] as const;
  for (const [name, backup] of invalid) {
    await test.step(name, async () => {
      await importText(page, JSON.stringify(backup));
      await expect(page.getByRole('alert')).toContainText('データは変更していません');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await persistedState(page)).toEqual(snapshot);
      await page.reload();
      expect(await exportBackup(page)).toEqual(current);
    });
  }
  await importText(page, JSON.stringify(restore));
  const dialog = page.getByRole('dialog', { name: 'バックアップを復元しますか？' });
  await expect(dialog).toContainText('履歴 3 件・店舗設定 1 件も入れ替えます');
  await expect(dialog).toContainText('復元は取り消せません');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await persistedState(page)).toEqual(snapshot);
  await importText(page, JSON.stringify(restore));
  await abortNextWrite(page);
  await dialog.getByRole('button', { name: '置き換えて復元' }).click();
  await expect(dialog.getByRole('alert')).toContainText('保存できませんでした。変更は反映していません');
  expect(await persistedState(page)).toEqual(snapshot);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.reload();
  expect(await exportBackup(page)).toEqual(current);
  await importText(page, JSON.stringify(restore));
  await dialog.getByRole('button', { name: '置き換えて復元' }).click();
  await expect(dialog).not.toBeVisible();
  const restored = await exportBackup(page);
  expect(restored.inventory).toEqual(restore.inventory);
  expect(restored.storePreferences).toEqual(restore.storePreferences);
  expect(restored.history).toHaveLength(restore.history.length + 1);
  for (const original of restore.history) {
    const imported = restored.history.find((event) => event.importedFromId === original.id);
    expect(imported).toMatchObject({ occurredAt: original.occurredAt, action: original.action, changes: original.changes });
    expect(imported!.id).not.toBe(original.id);
  }
  expect(restored.history.at(-1)!.action).toBe('restore');
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await expect(page.locator('.history-page').getByRole('button', { name: '元に戻す', exact: true })).toHaveCount(0);
  await page.reload();
  await expectItem(page, 'E1-01', 1, 0, false);
  expect(await exportBackup(page)).toEqual(restored);
  // The old inventory-only format must preserve the current personal metadata.
  await importText(page, JSON.stringify({ schemaVersion: 1, inventory: [{ cardId: 'e1-01', owned: 0, offered: 0, wanted: true }] }));
  await expect(dialog).toContainText('旧v1形式');
  await expect(dialog).toContainText('保持します');
  await dialog.getByRole('button', { name: '置き換えて復元' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expectItem(page, 'E1-01', 0, 0, true);
  const legacyRestored = await exportBackup(page);
  expect(legacyRestored.storePreferences).toEqual(restored.storePreferences);
  expect(legacyRestored.history.slice(0, -1)).toEqual(restored.history);
  expect(legacyRestored.history.at(-1)!.action).toBe('restore');
});
