import { test, expect } from './fixtures';
import { card, change, quantity, seedLegacyInventory, screenshotFullPage } from './workflow-helpers';

test('renders a usable two-column phone grid with equal frames for portrait and landscape images', async ({ page }) => {
  await seedLegacyInventory(page, ['e1-01', 'ep-005'].map((cardId) => ({ cardId, owned: 1, offered: 0, wanted: false })));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('combobox', { name: 'カードの絞り込み' }).selectOption('owned');
  await expect(page.locator('.inventory-card')).toHaveCount(2);
  const portrait = card(page, 'E1-01');
  const landscape = card(page, 'EP-005');
  await portrait.scrollIntoViewIfNeeded();
  await expect.poll(() => portrait.getByRole('img').evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([460, 670]);
  await expect.poll(() => landscape.getByRole('img').evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([670, 460]);
  const portraitBox = (await portrait.boundingBox())!;
  const landscapeBox = (await landscape.boundingBox())!;
  expect(portraitBox.y).toBe(landscapeBox.y);
  expect(landscapeBox.x).toBeGreaterThan(portraitBox.x + portraitBox.width);
  const frames = await page.locator('.inventory-card .card-artwork-frame').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(frames).toEqual([178, 178]);
  const fits = await page.locator('.inventory-card img').evaluateAll((images) => images.map((image) => getComputedStyle(image).objectFit));
  expect(fits).toEqual(['contain', 'contain']);
  await change(page, 'EP-005', '所持', '増やす').click();
  await expect(quantity(page, 'EP-005', '所持')).toHaveText('2枚');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshotFullPage(page, '/tmp/aikatsu-two-column-mobile.png');
});
