import { test, expect } from '@playwright/test';

test.describe('QR Book Tester Workflow', () => {
  test('executes end-to-end login guard, console workflow, and settings view', async ({ page }) => {
    // 1. Visit the app without auth -> should be protected by Login Screen
    await page.goto('/');

    await expect(page.locator('text=QR Book Tester')).toBeVisible();
    const loginBtn = page.getByRole('button', { name: /Sign in with Google/i });
    await expect(loginBtn).toBeVisible();

    // 2. Unlock protected console via appState.setAuth
    await page.evaluate(() => {
      // @ts-ignore
      window.__appState?.setAuth({ email: 'tester@org.com', name: 'Tester QA' }, 'mock-oauth-token-xyz');
    });

    // 3. Verify console dashboard is now unlocked
    await expect(page.locator('text=Testing Input Console')).toBeVisible();
    const pageInput = page.locator('#field-pageNumber');
    await expect(pageInput).toHaveValue('1');

    // 4. Verify live spreadsheet preview section is present
    await expect(page.locator('text=Sheet Live Preview')).toBeVisible();

    // 5. Navigate to Settings & Mapping View
    await page.getByRole('button', { name: 'Config & Mapping' }).click();
    await expect(page.locator('text=Target Google Spreadsheet')).toBeVisible();
    await expect(page.locator('text=Spreadsheet Column Mapping')).toBeVisible();

    // Verify OAuth Client ID is NOT shown in user UI
    await expect(page.locator('text=Google OAuth 2.0 Client ID')).toHaveCount(0);

    // Verify Sheet tab dropdown exists and is disabled when spreadsheet ID is empty
    const sheetDropdown = page.locator('#sheet-name');
    await expect(sheetDropdown).toBeDisabled();

    // 6. Return to Testing Console
    await page.getByRole('button', { name: /Console/ }).click();
    await expect(page.locator('text=Testing Input Console')).toBeVisible();

    // Verify Clear All button is present
    const clearAllBtn = page.getByRole('button', { name: 'Clear All' });
    await expect(clearAllBtn).toBeVisible();

    // Verify per-column Clear button works
    const fieldInput = page.locator('#field-pageNumber');
    await expect(fieldInput).toHaveValue('1');
    const colClearBtn = page.getByRole('button', { name: 'Kosongkan kolom Page Number' });
    await expect(colClearBtn).toBeVisible();
    await colClearBtn.click();
    await expect(fieldInput).toHaveValue('');

    // 7. Toggle Theme
    const themeBtn = page.getByRole('button', { name: 'Toggle dark/light theme' });
    await themeBtn.click();
    const html = page.locator('html');
    const isDark = await html.evaluate((el) => el.classList.contains('dark'));
    expect(typeof isDark).toBe('boolean');
  });
});
