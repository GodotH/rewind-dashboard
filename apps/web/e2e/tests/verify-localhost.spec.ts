import { test, expect } from '@playwright/test';
test('localhost dashboard loads', async ({ page }) => {
  await page.goto('http://localhost:3030/sessions', { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: '../../dashboard-final.png' });
});
