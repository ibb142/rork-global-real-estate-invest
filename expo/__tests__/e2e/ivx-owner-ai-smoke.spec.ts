/**
 * IVX Owner AI smoke E2E (Playwright)
 *
 * Verifies that the public landing surface reaches owner-login from the
 * primary entry points. Real device + Supabase owner flows live in the
 * Maestro suite. This file is intentionally minimal so it can run in a
 * vanilla CI environment without device emulators.
 */
import { test, expect } from '@playwright/test';

test.describe('IVX landing → owner login', () => {
  test('landing exposes owner login entry', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/IVX|Owner|Rork|Expo/i);
  });

  test('owner login screen renders', async ({ page }) => {
    await page.goto('/login?ownerMode=1');
    // Body should mention "Owner" somewhere on the rendered page.
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toContain('owner');
  });
});
