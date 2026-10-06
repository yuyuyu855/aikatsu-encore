import { test, expect } from './fixtures';
import { seedLegacyInventory } from './workflow-helpers';
import { exchangeFixture, observeCanvasText, downloadPng, type DrawnText } from './feature-helpers';

for (const [wantedCount, offeredCount] of [[25, 13], [13, 25]] as const) {
  test(`copies and downloads every exchange page for ${wantedCount} wanted and ${offeredCount} offered cards`, async ({ page, context }) => {
    await seedLegacyInventory(page, exchangeFixture(wantedCount, offeredCount));
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    // A prior card search must not project the exchange export down to one card.
    await page.getByRole('searchbox', { name: 'カード名・番号で検索' }).fill('E1-01');
    await page.getByRole('button', { name: '譲・求', exact: true }).click();
    await page.getByRole('button', { name: 'テキストをコピー', exact: true }).click();
    await expect(page.getByText('交換リストをコピーしました。', { exact: true })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`【求】${wantedCount}種`);
    expect(copied).toContain(`【譲】${offeredCount}種`);
    const wantedText = copied.split('【求】')[1]!.split('【譲】')[0]!;
    const offeredText = copied.split('【譲】')[1]!;
    expect(wantedText.match(/^E1-\d{2} /gm)).toHaveLength(wantedCount);
    expect(offeredText.match(/^E1-\d{2} /gm)).toHaveLength(offeredCount);
    for (let index = 0; index < wantedCount; index++) expect(wantedText).toContain(`E1-${String(index + 1).padStart(2, '0')} `);
    for (let index = 0; index < offeredCount; index++) expect(offeredText).toMatch(new RegExp(`E1-${index + 51} [^\n]+ ×${index % 3 + 1}枚`));
    expect(wantedText).not.toContain('×');
    expect(copied).toContain('オーロラキスキャミソール');

    await observeCanvasText(page);
    await page.getByRole('button', { name: '交換リスト画像を作成', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '交換リスト画像', exact: true });
    await expect(dialog).toContainText('全3ページ');
    await expect(dialog.getByRole('combobox', { name: '画像のページ' }).getByRole('option')).toHaveCount(3);
    const downloaded: Buffer[] = [];
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      await dialog.getByRole('combobox', { name: '画像のページ' }).selectOption(String(pageIndex));
      await expect(dialog.getByRole('link', { name: 'PNGを保存', exact: true })).toHaveCount(0);
      await page.evaluate(() => { (window as typeof window & { exchangeDraws: DrawnText[] }).exchangeDraws = []; });
      await dialog.getByRole('button', { name: 'このページの画像を作成', exact: true }).click();
      await expect(dialog.getByRole('img', { name: `交換リスト ${pageIndex + 1}ページのプレビュー` })).toBeVisible();
      const draws = await page.evaluate(() => (window as typeof window & { exchangeDraws: DrawnText[] }).exchangeDraws);
      const wantedNumbers = draws.filter((row) => row.y < 720 && /^E1-\d{2}$/.test(row.text)).map((row) => row.text);
      const offeredNumbers = draws.filter((row) => row.y >= 720 && /^E1-\d{2}$/.test(row.text)).map((row) => row.text);
      expect(wantedNumbers).toEqual(Array.from({ length: wantedCount }, (_, index) => `E1-${String(index + 1).padStart(2, '0')}`).slice(pageIndex * 12, (pageIndex + 1) * 12));
      expect(offeredNumbers).toEqual(Array.from({ length: offeredCount }, (_, index) => `E1-${index + 51}`).slice(pageIndex * 12, (pageIndex + 1) * 12));
      const png = await downloadPng(page, `/tmp/aikatsu-exchange-${wantedCount}wanted-${pageIndex + 1}.png`);
      if (downloaded.length) expect(png.equals(downloaded[downloaded.length - 1]!)).toBe(false);
      downloaded.push(png);
    }
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });
}

test('retains copy fallback and PNG download when clipboard or platform sharing fails', async ({ page }) => {
  await seedLegacyInventory(page, exchangeFixture(1, 1));
  // Only browser capability boundaries are replaced; Canvas still creates the real PNG.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
  });
  await page.getByRole('button', { name: '譲・求', exact: true }).click();
  await page.getByRole('button', { name: 'テキストをコピー', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'コピー用交換リスト' })).toHaveValue(/【求】1種[\s\S]+E1-01[\s\S]+【譲】1種[\s\S]+E1-51[\s\S]+×1枚/);
  await page.getByRole('button', { name: '交換リスト画像を作成', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '交換リスト画像', exact: true });
  await dialog.getByRole('button', { name: 'このページの画像を作成', exact: true }).click();
  await dialog.getByRole('button', { name: '画像を共有', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('共有をキャンセルしました。');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      (window as typeof window & { sharedFile: unknown }).sharedFile = file && { name: file.name, type: file.type, size: file.size };
      throw new DOMException('Denied', 'NotAllowedError');
    } });
  });
  await dialog.getByRole('button', { name: '画像を共有', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('共有できませんでした。「PNGを保存」をお使いください。');
  const shared = await page.evaluate(() => (window as typeof window & { sharedFile: { name: string; type: string; size: number } }).sharedFile);
  expect(shared).toMatchObject({ name: 'exchange-1.png', type: 'image/png' });
  expect(shared.size).toBeGreaterThan(20_000);
  await downloadPng(page, '/tmp/aikatsu-exchange-share-fallback.png');
});
