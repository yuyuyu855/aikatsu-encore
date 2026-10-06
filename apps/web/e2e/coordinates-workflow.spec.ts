import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { addOwned, seedLegacyInventory, resetScreenshotScroll } from './workflow-helpers';

const coordinate = (page: Page, name: string) => page.locator('.coordinate-group').filter({ has: page.getByRole('heading', { name: `${name} 通常`, exact: true }) });

test('counts each verified required card once and marks incomplete groups explicitly', async ({ page }) => {
  await seedLegacyInventory(page, [
    { cardId: 'e1-01', owned: 3, offered: 0, wanted: false },
    { cardId: 'e1-02', owned: 1, offered: 0, wanted: false },
    { cardId: 'e1-03', owned: 1, offered: 0, wanted: false },
    { cardId: 'e1-04', owned: 0, offered: 0, wanted: true },
  ]);
  await page.getByRole('button', { name: 'コーデ', exact: true }).click();
  const aurora = coordinate(page, 'オーロラキス');
  await expect(aurora.locator('.coordinate-state')).toHaveText('未完成 · 3 / 4');
  await expect(aurora.locator('.coordinate-missing')).toContainText('E1-04');
  await expect(page.locator('.coordinate-summary')).toContainText('0 / 18');
  await page.getByText('収録範囲と完成条件について', { exact: true }).click();
  await expect(page.getByText('パラレル版の独立したカードIDと構成を確認できていないため、パラレルコーデは未収録です。', { exact: true })).toBeVisible();
  expect(await page.locator('.coordinate-variant').allTextContents()).toEqual(Array(18).fill('通常'));
  await aurora.getByText('完成条件・確認元', { exact: true }).click();
  await expect(aurora.getByRole('link', { name: '公式カード裏面で組み合わせを確認' })).toHaveAttribute('href', 'https://dcd.aikatsu.com/encore/images/cardlist/card/E1-01_PR_b.webp');
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-04');
  await addOwned(page, 'E1-04', 1);
  await page.reload();
  await page.getByRole('button', { name: 'コーデ', exact: true }).click();
  await expect(aurora.locator('.coordinate-state')).toHaveText('完成 · 4 / 4');
  await expect(page.locator('.coordinate-summary')).toContainText('1 / 18');
  await page.getByRole('checkbox', { name: '未完成だけ' }).check();
  await expect(aurora).toHaveCount(0);
  await expect(page.locator('.coordinate-summary')).toContainText('1 / 18');
});

test('excludes optional accessories and includes required cards from another set', async ({ page }) => {
  await seedLegacyInventory(page, ['e1-05', 'e1-06', 'e1-07', 'e1-51', 'e1-52', 'ep-002'].map((cardId) => ({ cardId, owned: 1, offered: 0, wanted: false })));
  await page.getByRole('combobox', { name: '収録範囲' }).selectOption('encore-1');
  await page.getByRole('button', { name: 'コーデ', exact: true }).click();
  const ice = coordinate(page, 'アイスブルー');
  await expect(ice.locator('.coordinate-state')).toHaveText('完成 · 3 / 3');
  await expect(ice.locator('.coordinate-optional')).toContainText('完成条件に含めません');
  await expect(ice.locator('.coordinate-optional')).toContainText(/E1-08.+未所持/);
  const legendary = coordinate(page, 'レジェンダリールージュ');
  await expect(legendary.locator('.coordinate-state')).toHaveText('完成 · 3 / 3');
  await expect(legendary.locator('.coordinate-member').filter({ hasText: 'EP-002' })).toContainText('✓ 所持');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await resetScreenshotScroll(page);
  await page.screenshot({ path: '/tmp/aikatsu-coordinates-mobile.png' });
  await legendary.evaluate((element) => {
    const nav = document.querySelector('.page-nav')!;
    scrollTo(0, element.getBoundingClientRect().top + scrollY - nav.getBoundingClientRect().height - 16);
    return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.screenshot({ path: '/tmp/aikatsu-coordinate-legendary-mobile.png' });
});
