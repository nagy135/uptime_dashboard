import { test, expect } from '@playwright/test';
test('shows fleet, supports filtering, exposes details, and fits the viewport', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fleet status.' })).toBeVisible();
  for (const id of ['hetzner', 'nixpi', 'nixzero'])
    await expect(page.locator(`#${id}`)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search monitors' }).fill('relay');
  await expect(page.locator('.app-row')).toHaveCount(1);
  await page.locator('.app-row summary').click();
  await expect(page.getByRole('link', { name: 'Open application' })).toHaveAttribute(
    'href',
    'https://relay.infiniter.tech/',
  );
  await page.getByRole('textbox', { name: 'Search monitors' }).clear();
  await expect(page.locator('#nixzero')).toContainText('No web applications configured');
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    window: window.innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.window);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/${testInfo.project.name}.png`, fullPage: true });
});
