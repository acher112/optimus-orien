import { test, expect } from '@playwright/test';

test.describe('Optimus Orien Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('landing loads with content from the API', async ({ page }) => {
    // Brand title
    await expect(page.locator('.brand-logo-text')).toContainText('OPTIMUS ORIEN');

    // 6 Core Features
    const featureCards = page.locator('.feature-card');
    await expect(featureCards).toHaveCount(6);
    await expect(featureCards.first()).toContainText('Academic Performance');

    // 5 Role Tabs
    const roleTabs = page.locator('.role-tab');
    await expect(roleTabs).toHaveCount(5);

    // Pricing Carousel
    await expect(page.locator('.pricing-headline')).toContainText('Student-Based Pricing');
    const storyCards = page.locator('.story-card');
    await expect(storyCards).toHaveCount(2);

    // FAQ Section
    const faqItems = page.locator('.faq-item');
    await expect(faqItems).toHaveCount(12);

    // Giant Wordmark
    await expect(page.locator('.giant-wordmark')).toContainText('OPTIMUS ORIEN');
  });

  test('Sign in goes to login', async ({ page }) => {
    const signInBtn = page.locator('.landing-navbar .btn-nav-signin');
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Register opens the wizard', async ({ page }) => {
    const registerBtn = page.locator('.landing-navbar .btn-nav-register');
    await expect(registerBtn).toBeVisible();
    await registerBtn.click();
    await expect(page).toHaveURL(/\/login\?tab=register/);
  });

  test('plan preselection works', async ({ page }) => {
    // Click "Get Started with Standard"
    const standardPlanBtn = page.locator('.btn-select-plan').first();
    await standardPlanBtn.click();

    // Verifies redirect with plan preselection query parameter
    await expect(page).toHaveURL(/tab=register.*plan=standard/);
  });

  test('language toggle and RTL', async ({ page }) => {
    const toggleBtn = page.locator('.lang-toggle-btn');
    await expect(toggleBtn).toContainText('اردو');

    // Toggle to Urdu
    await toggleBtn.click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.landing-root')).toHaveAttribute('dir', 'rtl');
    await expect(toggleBtn).toContainText('English');

    // Toggle back to English
    await toggleBtn.click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('.landing-root')).toHaveAttribute('dir', 'ltr');
  });

  test('the mobile menu shows Sign in and Register', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    const hamburger = page.locator('.hamburger');
    await expect(hamburger).toBeVisible();

    // Open mobile menu
    await hamburger.click();

    const mobileMenu = page.locator('.nav-right');
    await expect(mobileMenu).toHaveClass(/mobile-open/);

    const mobileSignIn = mobileMenu.locator('.btn-nav-signin');
    const mobileRegister = mobileMenu.locator('.btn-nav-register');

    await expect(mobileSignIn).toBeVisible();
    await expect(mobileRegister).toBeVisible();
  });

  test('contact form validation and success', async ({ page }) => {
    // Open contact modal from navbar
    await page.locator('nav.nav-links a:has-text("Contact")').click();

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible();

    // Fill form
    await modal.locator('#contact-name').fill('Test Administrator');
    await modal.locator('#contact-email').fill('admin@test-school.edu');
    await modal.locator('#contact-phone').fill('+92 300 1234567');
    await modal.locator('#contact-company').fill('Metropolitan High');
    await modal.locator('#contact-subject').fill('Pricing Inquiry');
    await modal.locator('#contact-message').fill('We have 800 students and would like a quote.');

    // Submit
    await modal.locator('button[type="submit"]').click();

    // Expect success confirmation
    await expect(modal).toContainText('Thank you');
  });

  test('an existing session shows "Go to dashboard"', async ({ page }) => {
    // Simulate active session in localStorage
    await page.evaluate(() => {
      localStorage.setItem('userData', JSON.stringify({
        id: 1,
        name: 'Demo Admin',
        role: 'owner',
        email: 'owner@optimus.com'
      }));
    });
    await page.reload();

    const dashboardBtn = page.locator('.btn-nav-dashboard');
    await expect(dashboardBtn).toBeVisible();
    await expect(page.locator('.btn-nav-signin')).toHaveCount(0);
    await expect(page.locator('.btn-nav-register')).toHaveCount(0);
  });
});
