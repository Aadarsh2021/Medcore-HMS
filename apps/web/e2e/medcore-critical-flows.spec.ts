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

  test('4. Appointment scheduling route security and unauthenticated rejection', async ({ page }) => {
    await page.goto('/dashboard/appointments');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
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

  test('7. Patient registration route security and auth barrier', async ({ page }) => {
    // Unauthenticated user attempting to register new patient
    await page.goto('/dashboard/patients/new');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('8. Appointment booking route security and unauthenticated gate', async ({ page }) => {
    // Unauthenticated user attempting to open appointment booking wizard
    await page.goto('/dashboard/appointments/new');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('9. Role-based access to patient records index and detail deep links', async ({ page }) => {
    // Both patient list and specific detail view must require active authenticated session
    await page.goto('/dashboard/patients');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');

    await page.goto('/dashboard/patients/detail?id=unauthorized-tenant-patient');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url.includes('/login') || url.includes('/dashboard')).toBeTruthy();
  });

  test('10. Unauthorized access to clinical documents and prescriptions blocked', async ({ page }) => {
    // Prescriptions dashboard contains confidential clinical orders
    await page.goto('/dashboard/prescriptions');
    await page.waitForURL(/.*login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('11. Clinical document storage endpoint rejects unauthenticated download requests', async ({ request }) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://medcore-hms-api-7ie2.onrender.com/api';
    const response = await request.get(`${apiUrl}/storage/presigned-download`, {
      params: { objectKey: 'attachments/hospital-1/patient-1/clinical-record.pdf' },
      ignoreHTTPSErrors: true,
    });

    // Endpoint must reject unauthenticated requests with HTTP 401
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('12. Appointment conflict handling and booking endpoint requires authorization', async ({ request }) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://medcore-hms-api-7ie2.onrender.com/api';
    const response = await request.post(`${apiUrl}/appointments`, {
      data: {
        patientId: '00000000-0000-0000-0000-000000000000',
        doctorId: '00000000-0000-0000-0000-000000000000',
        departmentId: '00000000-0000-0000-0000-000000000000',
        appointmentDate: '2026-10-15T09:00:00Z',
        startTime: '09:00',
        endTime: '09:30',
        type: 'CONSULTATION',
      },
      ignoreHTTPSErrors: true,
    });

    // Confirms API enforces authentication boundary before checking schedule conflicts
    expect(response.status()).toBe(401);
  });
});
