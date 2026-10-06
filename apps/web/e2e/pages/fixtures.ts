import { test as browserTest, expect } from '../fixtures';

export const test = browserTest.extend({
  page: async ({ page }, use) => {
    const failures: string[] = [];
    const cardImageRequests: string[] = [];
    page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes('/cards/') || url.hostname === 'dcd.aikatsu.com') cardImageRequests.push(request.url());
    });
    await use(page);
    expect(failures, 'Publishing build must have no failed network requests').toEqual([]);
    expect(cardImageRequests, 'Publishing build must not request official card images').toEqual([]);
  },
});

export { expect };
