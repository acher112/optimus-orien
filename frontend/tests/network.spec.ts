import { test, expect } from '@playwright/test';

test.describe('Optimus Orien Academic Network & E2EE Chat Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the local dev or preview server
    await page.goto('/');
  });

  test('Academic Network boards load with verified snapshots', async ({ page }) => {
    // Switch to Network page
    const networkNavBtn = page.locator('text=Network, text=نیٹ ورک').first();
    if (await networkNavBtn.isVisible()) {
      await networkNavBtn.click();
    } else {
      await page.goto('/#network');
    }

    // Verify Honesty & Ethics Banner
    await expect(page.locator('.net-honesty-banner')).toBeVisible();
    await expect(page.locator('.net-honesty-banner')).toContainText('Honesty');

    // Verify Tab navigation
    const tabs = page.locator('.net-tab-btn');
    await expect(tabs).toHaveCount(5);

    // Verify Methodology Modal opens
    const methodologyBtn = page.locator('.net-outline-btn').first();
    await methodologyBtn.click();
    await expect(page.locator('.methodology-modal')).toBeVisible();
    await expect(page.locator('.methodology-modal')).toContainText('1, 2, 2, 4');
    await page.locator('.net-modal-foot button').click();
  });

  test('Student Achievers recognition board enforces strict non-contact protection', async ({ page }) => {
    await page.goto('/#network');

    // Switch to Student Achievers sub-tab
    const studentSubtab = page.locator('.net-subtab-pill:has-text("Student Achievers"), .net-subtab-pill:has-text("نمایاں طلبا")').first();
    if (await studentSubtab.isVisible()) {
      await studentSubtab.click();
    }

    // Verify Child Protection Disclaimer is prominently displayed
    const disclaimer = page.locator('.net-student-disclaimer');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText('Child Safety');

    // Confirm that no Connect or Message buttons exist on student achiever cards
    const connectButtons = page.locator('.net-student-card button:has-text("Connect"), .net-student-card button:has-text("Message")');
    await expect(connectButtons).toHaveCount(0);
  });

  test('Bilingual English & Urdu RTL layout toggling', async ({ page }) => {
    await page.goto('/#network');

    // Initial LTR
    const container = page.locator('.network-container');
    await expect(container).toHaveClass(/ltr/);

    // Toggle to Urdu
    const langBtn = page.locator('.net-lang-btn').first();
    await langBtn.click();

    // Verify RTL class applied
    await expect(container).toHaveClass(/rtl/);
    await expect(page.locator('.network-header h1')).toContainText('نیٹ ورک اور تعلیمی لیڈر بورڈز');

    // Toggle back to English
    await langBtn.click();
    await expect(container).toHaveClass(/ltr/);
  });

  test('Responsive Viewports & Screenshot Capture', async ({ page }) => {
    const viewports = [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#network');

      // Light Mode English
      await page.screenshot({
        path: `design/screenshots/after/network/network_${vp.name}_light_en.png`,
        fullPage: false
      });

      // Toggle to Urdu
      const langBtn = page.locator('.net-lang-btn').first();
      if (await langBtn.isVisible()) {
        await langBtn.click();
        await page.screenshot({
          path: `design/screenshots/after/network/network_${vp.name}_light_ur.png`,
          fullPage: false
        });
        await langBtn.click(); // revert
      }
    }
  });
});
