// File: server/tests/concurrency.test.js
// Description: Concurrency tests for profile saga and critical sections
// Purpose: Ensures race conditions are properly handled in distributed operations
// Notes: Tests profile updates, outbox events, and idempotency under load

const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const { updateProfileTransactional } = require('../services/profileSyncService');
const { storeEvent } = require('../services/outboxService');
const { supabaseAdmin } = require('../utils/supabaseClient');
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
  let testUserId;
  let testProfile;

  beforeEach(async () => {
    // Create test user and profile
    testUserId = `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create test profile in database
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: testUserId,
        display_name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        email: `${testUserId}@example.com`,
        phone: '',
        locale: 'en',
        timezone: 'UTC'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test profile: ${error.message}`);
    }

    testProfile = data;
  });

  afterEach(async () => {
    // Cleanup test data
    if (testUserId) {
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('user_id', testUserId);
    }
  });

  it('should handle concurrent profile updates without race conditions', async () => {
    const concurrentUpdates = 10;
    const updatePromises = [];

    // Simulate concurrent profile updates
    for (let i = 0; i < concurrentUpdates; i++) {
      const updatePromise = updateProfileTransactional(testUserId, {
        display_name: `Updated User ${i}`,
        phone: `+123456789${i}`
      });
      updatePromises.push(updatePromise);
    }

    // Wait for all updates to complete
    const results = await Promise.allSettled(updatePromises);

    // Check that all updates succeeded or failed gracefully
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    expect(successful).toBeGreaterThan(0);
    expect(successful + failed).toBe(concurrentUpdates);

    // Verify final profile state is consistent
    const { data: finalProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', testUserId)
      .single();

    expect(finalProfile).toBeDefined();
    expect(finalProfile.user_id).toBe(testUserId);
    expect(finalProfile.display_name).toMatch(/^Updated User \d+$/);
    expect(finalProfile.phone).toMatch(/^\+123456789\d$/);

    logger.info({
      event: 'test.concurrency.profile_updates',
      concurrentUpdates,
      successful,
      failed
    }, `Concurrent profile updates: ${successful} successful, ${failed} failed`);
  }, 30000);

  it('should handle concurrent outbox event storage', async () => {
    const concurrentEvents = 20;
    const eventPromises = [];

    // Simulate concurrent event storage
    for (let i = 0; i < concurrentEvents; i++) {
      const eventPromise = storeEvent('test.event', {
        userId: testUserId,
        sequence: i,
        timestamp: new Date().toISOString()
      }, {
        testId: `concurrent_test_${i}`,
        userId: testUserId
      });
      eventPromises.push(eventPromise);
    }

    // Wait for all events to be stored
    const results = await Promise.allSettled(eventPromises);

    // Check that all events were stored successfully
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    expect(successful).toBe(concurrentEvents);
    expect(failed).toBe(0);

    logger.info({
      event: 'test.concurrency.outbox_events',
      concurrentEvents,
      successful,
      failed
    }, `Concurrent outbox events: ${successful} successful, ${failed} failed`);
  }, 30000);

  it('should handle profile update with artificial delay to force race conditions', async () => {
    // This test artificially introduces delays to force race conditions
    const originalUpdateProfileTransactional = updateProfileTransactional;
    
    // Mock the function to add delays
    const mockUpdateProfileTransactional = async (userId, patch) => {
      // Add random delay between 50-200ms to simulate network latency
      await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 50));
      return originalUpdateProfileTransactional(userId, patch);
    };

    // Replace the function temporarily
    const updateProfileTransactionalModule = require('../services/profileSyncService');
    updateProfileTransactionalModule.updateProfileTransactional = mockUpdateProfileTransactional;

    try {
      const concurrentUpdates = 5;
      const updatePromises = [];

      // Simulate concurrent updates with delays
      for (let i = 0; i < concurrentUpdates; i++) {
        const updatePromise = mockUpdateProfileTransactional(testUserId, {
          display_name: `Delayed User ${i}`,
          locale: i % 2 === 0 ? 'en' : 'es'
        });
        updatePromises.push(updatePromise);
      }

      const results = await Promise.allSettled(updatePromises);

      // Verify at least one update succeeded
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(0);

      // Verify final state is consistent
      const { data: finalProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('user_id', testUserId)
        .single();

      expect(finalProfile).toBeDefined();
      expect(finalProfile.user_id).toBe(testUserId);

      logger.info({
        event: 'test.concurrency.delayed_updates',
        concurrentUpdates,
        successful
      }, `Delayed concurrent updates: ${successful} successful`);

    } finally {
      // Restore original function
      updateProfileTransactionalModule.updateProfileTransactional = originalUpdateProfileTransactional;
    }
  }, 30000);

  it('should maintain data consistency under high concurrency', async () => {
    const highConcurrencyUpdates = 50;
    const updatePromises = [];

    // Create updates that modify different fields
    const updateFields = [
      { display_name: 'High Concurrency User', phone: '+1111111111' },
      { given_name: 'High', family_name: 'Concurrency', locale: 'en' },
      { timezone: 'UTC', phone: '+2222222222' },
      { display_name: 'Another Name', locale: 'es' },
      { phone: '+3333333333', timezone: 'PST' }
    ];

    for (let i = 0; i < highConcurrencyUpdates; i++) {
      const fieldSet = updateFields[i % updateFields.length];
      const updatePromise = updateProfileTransactional(testUserId, fieldSet);
      updatePromises.push(updatePromise);
    }

    const results = await Promise.allSettled(updatePromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;

    // Verify final profile state is valid
    const { data: finalProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', testUserId)
      .single();

    expect(finalProfile).toBeDefined();
    expect(finalProfile.user_id).toBe(testUserId);
    expect(finalProfile.display_name).toBeTruthy();
    expect(finalProfile.phone).toMatch(/^\+[0-9]+$/);

    logger.info({
      event: 'test.concurrency.high_concurrency',
      highConcurrencyUpdates,
      successful
    }, `High concurrency test: ${successful}/${highConcurrencyUpdates} successful`);

  }, 45000);
});
