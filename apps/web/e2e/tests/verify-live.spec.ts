import { test, expect } from '@playwright/test';
test('live dashboard loads', async ({ page }) => {
  await page.goto('http://127.0.0.1:3031/sessions', { waitUntil: 'networkidle' });
  const title = await page.title();
  console.log('PAGE TITLE:', title);
  await page.screenshot({ path: '../../dashboard-live.png' });
});
