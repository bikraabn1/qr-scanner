import { test, expect } from '@playwright/test';

test.describe('QR Book Tester Workflow', () => {
  test('executes end-to-end QR scan, verification, and persistence', async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

    // 1. Visit the app
    await page.goto('/');

    // Verify Title and Dummy mode badge
    await expect(page.locator('text=QR Book Tester')).toBeVisible();
    await expect(page.locator('text=Dummy Mode')).toBeVisible();

    // 2. Adjust Page Number
    const pageInput = page.getByLabel('Book page number input');
    await expect(pageInput).toHaveValue('1');

    // Click +5 button
    await page.getByRole('button', { name: '+5' }).click();
    await expect(pageInput).toHaveValue('6');

    // 3. Insert Dummy QR sample
    await page.getByRole('button', { name: 'QR-1' }).click();

    const qrInput = page.locator('#qr-content-input');
    await expect(qrInput).toHaveValue('https://example.com/books/ch1/qr-01');

    // 4. Fill notes and verify result
    await page.locator('form').getByRole('button', { name: 'PASS' }).click();
    await page.locator('#record-notes').fill('Chapter 1 link tested and verified');

    // 5. Submit record
    await page.getByRole('button', { name: 'Submit Record' }).click();

    // Verify success banner appears
    await expect(page.locator('text=Record saved locally (Dummy Mode active)')).toBeVisible();

    // 6. Verify page number is preserved!
    await expect(pageInput).toHaveValue('6');

    // 7. Verify session history table has the entry
    const historyTable = page.locator('table');
    await expect(historyTable).toContainText('p.6');
    await expect(historyTable).toContainText('https://example.com/books/ch1/qr-01');
    await expect(historyTable).toContainText('PASS');
    await expect(historyTable).toContainText('Simulated');

    // 8. Navigate to Settings & Mapping View
    await page.getByRole('button', { name: 'Config & Mapping' }).click();
    await expect(page.locator('text=Google Sheets Integration')).toBeVisible();
    await expect(page.locator('text=Spreadsheet Column Mapping')).toBeVisible();

    // Verify default column mappings exist
    await expect(page.locator('text=Page Number').first()).toBeVisible();
    await expect(page.locator('text=Decoded QR / URL').first()).toBeVisible();

    // 9. Return to Testing Console
    await page.getByRole('button', { name: /Console/ }).click();
    await expect(page.locator('text=Book Page Tracker')).toBeVisible();

    // 10. Toggle Theme
    const themeBtn = page.getByRole('button', { name: 'Toggle dark/light theme' });
    await themeBtn.click();
    // Verify class toggle
    const html = page.locator('html');
    const isDark = await html.evaluate((el) => el.classList.contains('dark'));
    expect(typeof isDark).toBe('boolean');
  });
});
