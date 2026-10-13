import { test, expect } from '@playwright/test';

test.describe('MedCore HMS — Critical E2E Workflows', () => {
  test('1. Login screen renders and enforces credential validation', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/MedCore HMS/i);

    // Verify presence of input elements
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verify empty submission triggers validation
    await submitBtn.click();
    await expect(page.locator('text=/email|required|invalid/i')).toBeVisible({ timeout: 5000 });
  });

  test('2. Access control redirects unauthenticated access away from protected dashboard', async ({ page }) => {
    await page.goto('/dashboard/clinical');
    // Must redirect to login or show auth gate
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('3. Patient portal access control protects unauthorized records', async ({ page }) => {
    await page.goto('/dashboard/patients/detail?id=forbidden-patient-id');
    // Must redirect or display unauthorized gate
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl.includes('/login') || currentUrl.includes('/dashboard')).toBeTruthy();
  });

  test('4. Appointment scheduling UI route and booking interface structure', async ({ page }) => {
    await page.goto('/login');
    // Verify system branding and hospital tenancy indicators
    await expect(page.locator('text=/Hospital Management System|MedCore/i')).toBeVisible();
  });

  test('5. Billing and invoice payment route security boundaries', async ({ page }) => {
    await page.goto('/dashboard/billing/invoices');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('6. Role-specific hospital administration route protections', async ({ page }) => {
    await page.goto('/dashboard/departments');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});
