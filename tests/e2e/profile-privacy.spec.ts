// File: tests/e2e/profile-privacy.spec.ts
// Description: E2E tests for profile privacy toggle functionality
// Purpose: Verify UI <-> API round trip and toast notifications
// Notes: Tests complete user flow for account privacy changes

import { test, expect } from '@playwright/test';

test.describe('Profile Privacy Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // 1) "Login" by hitting the helper endpoint
    await page.request.post('/auth/set-cookie');
    
    // 2) Go to profile edit page
    await page.goto('/dashboard/profile-edit');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('toggle account privacy public <-> private', async ({ page }) => {
    // 3) Locate the select and current value
    const select = page.locator('#accountPrivacy');
    await expect(select).toBeVisible();

    const before = await select.inputValue(); // "public" or "private"
    const after = before === 'public' ? 'private' : 'public';

    // 4) Change and save
    await select.selectOption(after);
    
    // Find and click the Save button for the Account Privacy field
    const accountPrivacyContainer = page.locator('#accountPrivacy').locator('..');
    const saveButton = accountPrivacyContainer.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // 5) Expect success toast and canonical text
    await expect(page.locator('.success-toast')).toBeVisible();
    const display = page.locator('#accountPrivacyDisplay');
    await expect(display).toHaveText(new RegExp(after, 'i'));

    // 6) Flip back (idempotence test)
    const editButton = accountPrivacyContainer.getByRole('button', { name: 'Edit' });
    await editButton.click();
    await select.selectOption(before);
    await saveButton.click();
    
    await expect(page.locator('.success-toast')).toBeVisible();
    await expect(display).toHaveText(new RegExp(before, 'i'));
  });

  test('cancel reverts to original value', async ({ page }) => {
    // Get initial value
    const select = page.locator('#accountPrivacy');
    const initialValue = await select.inputValue();
    
    // Enter edit mode
    const accountPrivacyContainer = page.locator('#accountPrivacy').locator('..');
    const editButton = accountPrivacyContainer.getByRole('button', { name: 'Edit' });
    await editButton.click();
    
    // Change value
    const newValue = initialValue === 'public' ? 'private' : 'public';
    await select.selectOption(newValue);
    
    // Cancel
    const cancelButton = accountPrivacyContainer.getByRole('button', { name: 'Cancel' });
    await cancelButton.click();
    
    // Verify reverted to original value
    await expect(select).toHaveValue(initialValue);
    const display = page.locator('#accountPrivacyDisplay');
    await expect(display).toHaveText(new RegExp(initialValue, 'i'));
  });

  test('display shows canonical values (not booleans)', async ({ page }) => {
    const display = page.locator('#accountPrivacyDisplay');
    const displayText = await display.textContent();
    
    // Verify display shows "Public" or "Private", not "true" or "false"
    expect(displayText).toMatch(/^(Public|Private)$/i);
    expect(displayText).not.toMatch(/^(true|false)$/i);
  });
});
