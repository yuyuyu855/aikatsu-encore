import { test as base, expect } from '@playwright/test';

type BrowserFixtures = { expectedImageFailures: string[] };

/** Any unexpected browser exception or console error fails the workflow check. */
export const test = base.extend<BrowserFixtures>({
  expectedImageFailures: [[], { option: true }],
  page: async ({ page, expectedImageFailures }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // Only the explicit image-fallback test may induce a failed image request.
      const path = new URL(message.location().url || 'about:blank').pathname;
      if (expectedImageFailures.includes(path)
        && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)') return;
      errors.push(`${message.location().url}: ${message.text()}`);
    });
    await use(page);
    expect(errors, 'Unexpected browser errors').toEqual([]);
  },
});

export { expect };
