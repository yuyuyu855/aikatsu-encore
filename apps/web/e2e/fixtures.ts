import { test as base, expect } from '@playwright/test';

/** Any unexpected browser exception or console error fails the workflow check. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      errors.push(`${message.location().url}: ${message.text()}`);
    });
    await use(page);
    expect(errors, 'Unexpected browser errors').toEqual([]);
  },
});

export { expect };
