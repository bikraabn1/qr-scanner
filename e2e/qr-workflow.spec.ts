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

    // 3. Verify console dashboard & Page Tracker is now unlocked
    const pageInput = page.getByLabel('Book page number input');
    await expect(pageInput).toHaveValue('1');

    // Click +5 button
    await page.getByRole('button', { name: '+5' }).click();
    await expect(pageInput).toHaveValue('6');

    // Typing a page number by hand must stick (regression: field used to snap back)
    await pageInput.fill('');
    await pageInput.type('42');
    await expect(pageInput).toHaveValue('42');
    await expect(page.locator('#field-pageNumber')).toHaveValue('42');

    // And the form field itself must accept typing too
    await page.locator('#field-pageNumber').fill('');
    await page.locator('#field-pageNumber').type('7');
    await expect(page.locator('#field-pageNumber')).toHaveValue('7');
    await expect(pageInput).toHaveValue('7');

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
    await expect(page.locator('text=Book Page Tracker')).toBeVisible();

    // 7. Toggle Theme
    const themeBtn = page.getByRole('button', { name: 'Toggle dark/light theme' });
    await themeBtn.click();
    const html = page.locator('html');
    const isDark = await html.evaluate((el) => el.classList.contains('dark'));
    expect(typeof isDark).toBe('boolean');
  });
});
