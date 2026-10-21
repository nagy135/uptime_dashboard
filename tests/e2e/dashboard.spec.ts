import { test, expect, type Page } from '@playwright/test';
import type { Dashboard, PublicApp } from '../../src/shared/types';

const themeButton = (page: Page) => page.getByRole('button', { name: /^Color theme:/ });
async function chooseTheme(page: Page, name: string) {
  await themeButton(page).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
  await expect(themeButton(page)).toHaveAccessibleName(`Color theme: ${name}`);
  await expect(page.getByRole('menu', { name: 'Color theme' })).toHaveCount(0);
}

test('keeps disabled apps listed without counting them as issues or unknown', async ({ page }) => {
  const now = Date.now();
  const active: PublicApp = {
    id: 'test/live',
    name: 'Live app',
    domain: 'live.example',
    kind: 'application',
    access: 'public',
    status: 'up',
    stale: false,
    latest: { appId: 'test/live', checkedAt: now, status: 'up' },
    history: [],
    availability: 100,
    coverage: 100,
  };
  const retired = (id: string, name: string, domain: string): PublicApp => ({
    ...active,
    id,
    name,
    domain,
    status: 'disabled',
    latest: null,
    availability: null,
    coverage: 0,
  });
  const dashboard: Dashboard = {
    generatedAt: now,
    lastCheckedAt: now,
    nextCheckAt: now + 30000,
    pollIntervalMs: 30000,
    staleAfterMs: 90000,
    inventoryUpdatedAt: new Date(now).toISOString(),
    devices: [
      {
        id: 'hetzner',
        name: 'Hetzner',
        subtitle: 'Test fleet',
        status: 'up',
        reachable: true,
        checkedAt: now,
        lastSeenAt: now,
        apps: [
          active,
          retired('test/drive', 'Drive', 'drive.example'),
          retired('test/editor', 'Shift development', 'edit-shift.example'),
        ],
      },
    ],
  };
  await page.route('**/api/status', (route) => route.fulfill({ json: dashboard }));
  await page.goto('/');
  await expect(page.locator('.health-banner')).toContainText('All systems operational');
  await expect(page.locator('.health-banner')).toContainText(
    '1 operational · 0 need attention · 0 unknown · 2 disabled',
  );
  await expect(page.locator('.badge.disabled')).toHaveCount(2);
  await expect(page.locator('.opencode-group')).toContainText('Disabled');
  await page.getByRole('textbox', { name: 'Search monitors' }).fill('disabled');
  await expect(page.locator('.app-row')).toHaveCount(2);
  await page.locator('.app-row').filter({ hasText: 'Drive' }).locator('summary').click();
  await expect(
    page.locator('.app-row').filter({ hasText: 'Drive' }).locator('.disabled-note'),
  ).toContainText('Intentionally disabled');
  await expect(page.locator('.app-row').filter({ hasText: 'Drive' })).not.toContainText(
    'Not checked',
  );
  await page.getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(page.locator('.app-row')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search monitors' }).clear();
  await expect(page.locator('.app-row')).toHaveCount(0);
});

test('shows an icon-only theme button with a downward menu and Lookout favicon', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const trigger = themeButton(page);
  const menu = page.getByRole('menu', { name: 'Color theme' });
  await expect(page.locator('.topbar .theme-toggle')).toBeVisible();
  await expect(page.locator('.page-heading .theme-picker')).toHaveCount(0);
  await expect(page.getByText('LIVE MONITORING', { exact: true })).toHaveCount(0);
  await expect(trigger).toHaveText('');
  await expect(trigger.locator('.lucide-monitor')).toBeVisible();
  await trigger.click();
  await expect(menu).toBeVisible();
  for (const [name, icon] of [
    ['System', 'monitor'],
    ['Light', 'sun'],
    ['Dark', 'moon'],
  ]) {
    const option = menu.getByRole('menuitemradio', { name, exact: true });
    await expect(option.locator(`.lucide-${icon}`)).toBeVisible();
    await expect(option).toHaveAttribute('aria-checked', String(name === 'System'));
  }
  const buttonBox = (await trigger.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(buttonBox.y).toBeLessThan(40);
  expect(menuBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height + 6);
  expect(Math.abs(menuBox.x + menuBox.width - buttonBox.x - buttonBox.width)).toBeLessThan(1);
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-theme-menu-light.png` });

  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(trigger.locator('.lucide-moon')).toBeVisible();
  await expect(trigger).toHaveCSS('background-color', 'rgb(29, 39, 32)');
  await trigger.click();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-theme-menu-dark.png` });
  await page.getByRole('heading', { name: 'Fleet status.' }).click();
  await expect(menu).toHaveCount(0);

  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAccessibleName('Color theme: Light');
  await expect(trigger).toBeFocused();
  await expect(trigger.locator('.lucide-sun')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const favicon = await page.request.get('/favicon.svg');
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
  expect(await favicon.text()).toContain('<title>Lookout</title>');
});

test('follows the system appearance and remembers explicit theme choices', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const theme = themeButton(page);
  const root = page.locator('html');
  await expect(theme).toHaveAccessibleName('Color theme: System');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await expect(page.locator('.stat').first()).toHaveCSS('background-color', 'rgb(29, 39, 32)');

  await chooseTheme(page, 'Light');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');
  await page.reload();
  await expect(theme).toHaveAccessibleName('Color theme: Light');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');

  await chooseTheme(page, 'Dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await page.reload();
  await expect(theme).toHaveAccessibleName('Color theme: Dark');
  await expect(root).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#151c18');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  );
  await page.screenshot({ path: `test-results/${testInfo.project.name}-dark.png`, fullPage: true });

  await chooseTheme(page, 'System');
  await expect(root).toHaveCSS('background-color', 'rgb(246, 247, 244)');
  await page.reload();
  await expect(theme).toHaveAccessibleName('Color theme: System');
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
  const theme = themeButton(page);
  await expect(theme).toHaveAccessibleName('Color theme: System');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(21, 28, 24)');
  await chooseTheme(page, 'Light');
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
