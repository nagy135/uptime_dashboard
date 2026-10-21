import { test, expect } from '@playwright/test';

test('follows the system appearance and remembers explicit theme choices', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const theme = page.getByRole('combobox', { name: 'Color theme' });
  const root = page.locator('html');
  await expect(theme).toHaveValue('system');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await expect(page.locator('.stat').first()).toHaveCSS('background-color', 'rgb(29, 39, 32)');

  await theme.selectOption('light');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');
  await page.reload();
  await expect(theme).toHaveValue('light');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');

  await theme.selectOption('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await page.reload();
  await expect(theme).toHaveValue('dark');
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#151c18');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  );
  await page.screenshot({ path: `test-results/${testInfo.project.name}-dark.png`, fullPage: true });

  await theme.selectOption('system');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');
  await page.reload();
  await expect(theme).toHaveValue('system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
});

test('can change themes when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem']) {
      Object.defineProperty(Storage.prototype, method, {
        value: () => {
          throw new Error('Storage unavailable');
        },
      });
    }
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const theme = page.getByRole('combobox', { name: 'Color theme' });
  await expect(theme).toHaveValue('system');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await theme.selectOption('light');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(246, 247, 244)');
});

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
  const privateServices = page.locator('#nixpi .private-group');
  await expect(privateServices.getByRole('heading', { name: 'Private services' })).toBeVisible();
  const audio = privateServices.locator('.app-row').filter({ hasText: 'Audio notifications' });
  await expect(audio).toContainText('Private · Tailscale');
  await audio.locator('summary').click();
  await expect(audio.getByRole('link', { name: 'Open via Tailscale' })).toHaveAttribute(
    'href',
    'https://nixpi.tail6650cb.ts.net:8444/',
  );
  await expect(audio).not.toContainText('Public URL');
  await expect(privateServices).toContainText('Private · On host');
  await page.getByRole('textbox', { name: 'Search monitors' }).fill('tailscale');
  await expect(page.locator('#nixpi .private-group')).toContainText('Audio notifications');
  await expect(page.locator('#nixpi .private-group')).toContainText('T3 Code');
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
