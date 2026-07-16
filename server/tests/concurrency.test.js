// File: server/tests/concurrency.test.js
// Description: Concurrency tests for profile saga and critical sections
// Purpose: Ensures race conditions are properly handled in distributed operations
// Notes: Tests profile updates, outbox events, and idempotency under load

const { describe, it, expect, beforeEach, afterEach } = require('vitest');
// I am loading `../services/profileSyncService` into `updateProfileTransactional` so this file can reuse that dependency below.
const { updateProfileTransactional } = require('../services/profileSyncService');
// I am loading `../services/outboxService` into `storeEvent` so this file can reuse that dependency below.
const { storeEvent } = require('../services/outboxService');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');

/**
 * WHAT:
 * Concurrency tests that simulate multiple simultaneous operations to detect race conditions.
 * 
 * WHY:
 * Distributed systems are vulnerable to race conditions that can cause data inconsistency.
 * We need to verify our saga pattern and critical sections work correctly under load.
 * 
 * HOW:
 * 1. Create test user and profile
 * 2. Simulate concurrent profile updates
 * 3. Verify final state is consistent
 * 4. Test outbox event ordering and deduplication
 */

describe('Concurrency Tests', () => {
  // I am saving `testUserId` here so the nearby steps can reuse the same value without rebuilding it each time.
  let testUserId;
  // I am saving `_testProfile` here so the nearby steps can reuse the same value without rebuilding it each time.
  let _testProfile;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(async () => {
    // Create test user and profile
    testUserId = `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create test profile in database
    const { data, error } = await supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('profiles')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .insert({
        // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
        user_id: testUserId,
        // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
        display_name: 'Test User',
        // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
        given_name: 'Test',
        // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
        family_name: 'User',
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: `${testUserId}@example.com`,
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: '',
        // I am keeping the `locale` field in this object so the receiving code can read that value by its expected name.
        locale: 'en',
        // I am keeping the `timezone` field in this object so the receiving code can read that value by its expected name.
        timezone: 'UTC'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select()
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(`Failed to create test profile: ${error.message}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
    _testProfile = data;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(async () => {
    // Cleanup test data
    if (testUserId) {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await supabaseAdmin
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('profiles')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .delete()
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .eq('user_id', testUserId);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle concurrent profile updates without race conditions', async () => {
    // I am saving `concurrentUpdates` here so the nearby steps can reuse the same value without rebuilding it each time.
    const concurrentUpdates = 10;
    // I am saving `updatePromises` here so the nearby steps can reuse the same value without rebuilding it each time.
    const updatePromises = [];

    // Simulate concurrent profile updates
    for (let i = 0; i < concurrentUpdates; i++) {
      // I am saving `updatePromise` here so the nearby steps can reuse the same value without rebuilding it each time.
      const updatePromise = updateProfileTransactional(testUserId, {
        // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
        display_name: `Updated User ${i}`,
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: `+123456789${i}`
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      updatePromises.push(updatePromise);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Wait for all updates to complete
    const results = await Promise.allSettled(updatePromises);

    // Check that all updates succeeded or failed gracefully
    const successful = results.filter(r => r.status === 'fulfilled').length;
    // I am saving `failed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const failed = results.filter(r => r.status === 'rejected').length;

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(successful).toBeGreaterThan(0);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(successful + failed).toBe(concurrentUpdates);

    // Verify final profile state is consistent
    const { data: finalProfile } = await supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('profiles')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('*')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', testUserId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile).toBeDefined();
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile.user_id).toBe(testUserId);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile.display_name).toMatch(/^Updated User \d+$/);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile.phone).toMatch(/^\+123456789\d$/);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'test.concurrency.profile_updates',
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      concurrentUpdates,
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      successful,
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      failed
    // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
    }, `Concurrent profile updates: ${successful} successful, ${failed} failed`);
  // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
  }, 30000);

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle concurrent outbox event storage', async () => {
    // I am saving `concurrentEvents` here so the nearby steps can reuse the same value without rebuilding it each time.
    const concurrentEvents = 20;
    // I am saving `eventPromises` here so the nearby steps can reuse the same value without rebuilding it each time.
    const eventPromises = [];

    // Simulate concurrent event storage
    for (let i = 0; i < concurrentEvents; i++) {
      // I am saving `eventPromise` here so the nearby steps can reuse the same value without rebuilding it each time.
      const eventPromise = storeEvent('test.event', {
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: testUserId,
        // I am keeping the `sequence` field in this object so the receiving code can read that value by its expected name.
        sequence: i,
        // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
        timestamp: new Date().toISOString()
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      }, {
        // I am keeping the `testId` field in this object so the receiving code can read that value by its expected name.
        testId: `concurrent_test_${i}`,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: testUserId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      eventPromises.push(eventPromise);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Wait for all events to be stored
    const results = await Promise.allSettled(eventPromises);

    // Check that all events were stored successfully
    const successful = results.filter(r => r.status === 'fulfilled').length;
    // I am saving `failed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const failed = results.filter(r => r.status === 'rejected').length;

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(successful).toBe(concurrentEvents);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(failed).toBe(0);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'test.concurrency.outbox_events',
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      concurrentEvents,
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      successful,
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      failed
    // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
    }, `Concurrent outbox events: ${successful} successful, ${failed} failed`);
  // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
  }, 30000);

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle profile update with artificial delay to force race conditions', async () => {
    // This test artificially introduces delays to force race conditions
    const originalUpdateProfileTransactional = updateProfileTransactional;
    
    // Mock the function to add delays
    const mockUpdateProfileTransactional = async (userId, patch) => {
      // Add random delay between 50-200ms to simulate network latency
      await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 50));
      // This return sends the completed value or response back to the code that called this function.
      return originalUpdateProfileTransactional(userId, patch);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // Replace the function temporarily
    const updateProfileTransactionalModule = require('../services/profileSyncService');
    // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
    updateProfileTransactionalModule.updateProfileTransactional = mockUpdateProfileTransactional;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `concurrentUpdates` here so the nearby steps can reuse the same value without rebuilding it each time.
      const concurrentUpdates = 5;
      // I am saving `updatePromises` here so the nearby steps can reuse the same value without rebuilding it each time.
      const updatePromises = [];

      // Simulate concurrent updates with delays
      for (let i = 0; i < concurrentUpdates; i++) {
        // I am saving `updatePromise` here so the nearby steps can reuse the same value without rebuilding it each time.
        const updatePromise = mockUpdateProfileTransactional(testUserId, {
          // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
          display_name: `Delayed User ${i}`,
          // I am keeping the `locale` field in this object so the receiving code can read that value by its expected name.
          locale: i % 2 === 0 ? 'en' : 'es'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am calling this helper here so the current workflow performs this step before it moves on.
        updatePromises.push(updatePromise);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `results` here so the nearby steps can reuse the same value without rebuilding it each time.
      const results = await Promise.allSettled(updatePromises);

      // Verify at least one update succeeded
      const successful = results.filter(r => r.status === 'fulfilled').length;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(successful).toBeGreaterThan(0);

      // Verify final state is consistent
      const { data: finalProfile } = await supabaseAdmin
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('profiles')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('*')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .eq('user_id', testUserId)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .single();

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(finalProfile).toBeDefined();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(finalProfile.user_id).toBe(testUserId);

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'test.concurrency.delayed_updates',
        // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
        concurrentUpdates,
        // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
        successful
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      }, `Delayed concurrent updates: ${successful} successful`);

    // This final block runs after success or failure so the shared cleanup still happens in either outcome.
    } finally {
      // Restore original function
      updateProfileTransactionalModule.updateProfileTransactional = originalUpdateProfileTransactional;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
  }, 30000);

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should maintain data consistency under high concurrency', async () => {
    // I am saving `highConcurrencyUpdates` here so the nearby steps can reuse the same value without rebuilding it each time.
    const highConcurrencyUpdates = 50;
    // I am saving `updatePromises` here so the nearby steps can reuse the same value without rebuilding it each time.
    const updatePromises = [];

    // Create updates that modify different fields
    const updateFields = [
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      { display_name: 'High Concurrency User', phone: '+1111111111' },
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      { given_name: 'High', family_name: 'Concurrency', locale: 'en' },
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      { timezone: 'UTC', phone: '+2222222222' },
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      { display_name: 'Another Name', locale: 'es' },
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      { phone: '+3333333333', timezone: 'PST' }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    ];

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (let i = 0; i < highConcurrencyUpdates; i++) {
      // I am saving `fieldSet` here so the nearby steps can reuse the same value without rebuilding it each time.
      const fieldSet = updateFields[i % updateFields.length];
      // I am saving `updatePromise` here so the nearby steps can reuse the same value without rebuilding it each time.
      const updatePromise = updateProfileTransactional(testUserId, fieldSet);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      updatePromises.push(updatePromise);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `results` here so the nearby steps can reuse the same value without rebuilding it each time.
    const results = await Promise.allSettled(updatePromises);
    // I am saving `successful` here so the nearby steps can reuse the same value without rebuilding it each time.
    const successful = results.filter(r => r.status === 'fulfilled').length;

    // Verify final profile state is valid
    const { data: finalProfile } = await supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('profiles')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('*')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', testUserId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile).toBeDefined();
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile.user_id).toBe(testUserId);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile.display_name).toBeTruthy();
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(finalProfile.phone).toMatch(/^\+[0-9]+$/);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'test.concurrency.high_concurrency',
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      highConcurrencyUpdates,
      // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
      successful
    // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
    }, `High concurrency test: ${successful}/${highConcurrencyUpdates} successful`);

  // I am keeping this line here because the surrounding concurrency.test.js workflow expects this value or operation before it continues.
  }, 45000);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
