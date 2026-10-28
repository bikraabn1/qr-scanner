import { test } from '@playwright/test';

test.describe('Take Redesign Screenshots', () => {
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      test(`capture ${vp.name} - ${theme} theme`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');

        // Set theme
        if (theme === 'dark') {
          await page.evaluate(() => {
            document.documentElement.classList.add('dark');
            window.localStorage.setItem('qr_book_tester_theme_v1', JSON.stringify('dark'));
          });
        } else {
          await page.evaluate(() => {
            document.documentElement.classList.remove('dark');
            window.localStorage.setItem('qr_book_tester_theme_v1', JSON.stringify('light'));
          });
        }
        await page.reload();

        // 1. Console View (with some sample data populated)
        await page.getByRole('button', { name: 'QR-1' }).click();
        await page.screenshot({ path: `screenshots/${vp.name}-${theme}-console.png`, fullPage: true });

        // 2. Config View
        await page.getByRole('button', { name: 'Config & Mapping' }).click();
        await page.screenshot({ path: `screenshots/${vp.name}-${theme}-config.png`, fullPage: true });
      });
    }
  }
});
