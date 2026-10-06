import { test, expect } from './fixtures';
import { addOwned, change, wanted, quantity, expectItem, exportBackup, persistedState, abortNextWrite, screenshotFullPage } from './workflow-helpers';
import { recordStore } from './feature-helpers';

test('persists exact mutation history and undoes the latest operation only once', async ({ page }) => {
  await page.goto('/');
  await addOwned(page, 'E1-01', 1);
  await change(page, 'E1-01', '譲れる枚数', '増やす').click();
  await expect(quantity(page, 'E1-01', '譲れる枚数')).toHaveText('1枚');
  await wanted(page, 'E1-01').click();
  await expect(wanted(page, 'E1-01')).toBeChecked();
  const original = await exportBackup(page);
  expect(original.history.map((event) => event.action)).toEqual(['owned', 'offered', 'wanted']);
  expect(original.history[0]!.changes).toEqual([{ kind: 'inventory', targetId: 'e1-01',
    before: { cardId: 'e1-01', owned: 0, offered: 0, wanted: false },
    after: { cardId: 'e1-01', owned: 1, offered: 0, wanted: false },
  }]);
  expect(original.history[2]!.changes).toEqual([{ kind: 'inventory', targetId: 'e1-01',
    before: { cardId: 'e1-01', owned: 1, offered: 1, wanted: false },
    after: { cardId: 'e1-01', owned: 1, offered: 1, wanted: true },
  }]);
  await page.reload();
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await expect(page.locator('.history-event')).toHaveCount(3);
  const latest = page.getByTestId(`history-${original.history[2]!.id}`);
  await expect(latest).toContainText('欲しい 未選択 → 選択');
  await expect(page.locator('.history-page').getByRole('button', { name: '元に戻す', exact: true })).toHaveCount(1);
  await latest.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.locator('.history-event')).toHaveCount(4);
  await expect(page.locator('.history-event').first()).toContainText('操作を元に戻した');
  await expect(page.locator('.history-page').getByRole('button', { name: '元に戻す', exact: true })).toHaveCount(0);
  const undone = await exportBackup(page);
  expect(undone.history.slice(0, 3)).toEqual(original.history);
  expect(undone.history[3]).toMatchObject({ action: 'undo', undoOf: original.history[2]!.id, sequence: 4 });
  await page.reload();
  await expectItem(page, 'E1-01', 1, 1, false);
  // Adjusting owned below offered is one recorded operation and one atomic undo.
  await change(page, 'E1-01', '所持', '減らす').click();
  await page.getByRole('dialog', { name: '譲れる枚数も調整しますか？' }).getByRole('button', { name: '調整して保存' }).click();
  await expectItem(page, 'E1-01', 0, 0, false);
  await page.getByRole('button', { name: '直近の操作を元に戻す', exact: true }).click();
  await expectItem(page, 'E1-01', 1, 1, false);
  await page.reload();
  await expectItem(page, 'E1-01', 1, 1, false);
  const final = await exportBackup(page);
  expect(final.history.slice(-2).map((event) => event.action)).toEqual(['adjust', 'undo']);
  expect(final.history.at(-1)!.changes).toEqual([{ kind: 'inventory', targetId: 'e1-01',
    before: { cardId: 'e1-01', owned: 0, offered: 0, wanted: false },
    after: { cardId: 'e1-01', owned: 1, offered: 1, wanted: false },
  }]);
});

test('rolls back inventory, store data, history, and CAS counters when undo aborts after a write', async ({ page }) => {
  await page.goto('/');
  await addOwned(page, 'E1-01', 1);
  await recordStore(page, '訪問予定', 0);
  const original = await exportBackup(page);
  const snapshot = await persistedState(page);
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await abortNextWrite(page);
  await page.locator('.history-page').getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存できませんでした。変更は反映していません');
  expect(await persistedState(page)).toEqual(snapshot);
  await page.reload();
  await expectItem(page, 'E1-01', 1, 0, false);
  expect(await exportBackup(page)).toEqual(original);
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await page.locator('.history-page').getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.locator('.history-event')).toHaveCount(original.history.length + 1);
  const undone = await exportBackup(page);
  expect(undone.inventory).toEqual(original.inventory);
  expect(undone.storePreferences[0]).toMatchObject({ favorite: true, note: '', machineCount: null });
  expect(undone.history.at(-1)).toMatchObject({ action: 'undo', undoOf: original.history.at(-1)!.id });
  expect((await persistedState(page)).state.revision).toBe(Number(snapshot.state.revision) + 1);
  await page.reload();
  expect(await exportBackup(page)).toEqual(undone);
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshotFullPage(page, '/tmp/aikatsu-history-mobile.png');
});
