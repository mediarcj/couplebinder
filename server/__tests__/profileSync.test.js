// File: server/__tests__/profileSync.test.js
// Description: Tests for transactional profile synchronization
// Purpose: Ensure profile updates maintain consistency between auth.users and profiles
// Notes: Tests both success and failure scenarios with rollback

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `updateProfileTransactional` from `../services/profileSyncService` here because profileSync.test.js uses it in the steps below.
import { updateProfileTransactional, reconcileProfileData } from '../services/profileSyncService';

// Mock Supabase admin client
const mockSupabaseAdmin = {
  // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
  auth: {
    // I am keeping the `admin` field in this object so the receiving code can read that value by its expected name.
    admin: {
      // I am keeping the `getUserById` field in this object so the receiving code can read that value by its expected name.
      getUserById: vi.fn(),
      // I am keeping the `updateUserById` field in this object so the receiving code can read that value by its expected name.
      updateUserById: vi.fn()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping the `from` field in this object so the receiving code can read that value by its expected name.
  from: vi.fn(() => ({
    // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
    update: vi.fn(() => ({
      // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
      eq: vi.fn(() => ({
        // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
        select: vi.fn(() => ({
          // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
          single: vi.fn()
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        }))
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      }))
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    })),
    // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
    select: vi.fn(() => ({
      // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
      eq: vi.fn(() => ({
        // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
        single: vi.fn()
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      })),
      // I am keeping the `limit` field in this object so the receiving code can read that value by its expected name.
      limit: vi.fn()
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }))
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  }))
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock logger
const mockLogger = {
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: vi.fn(),
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: vi.fn(),
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: vi.fn(),
  // I am keeping the `debug` field in this object so the receiving code can read that value by its expected name.
  debug: vi.fn()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock modules
vi.mock('../utils/supabaseClient', () => ({
  // I am keeping the `supabaseAdmin` field in this object so the receiving code can read that value by its expected name.
  supabaseAdmin: mockSupabaseAdmin
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../utils/logger', () => mockLogger);

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Profile Synchronization Service', () => {
  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.resetAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('updateProfileTransactional', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should successfully update both auth.users and profiles', async () => {
      // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const userId = 'test-user-123';
      // I am saving `patch` here so the nearby steps can reuse the same value without rebuilding it each time.
      const patch = {
        // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
        display_name_override: 'John Doe',
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: '+1234567890'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // Mock successful getUserById
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
          user_metadata: { display_name: 'Old Name' },
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: '+0987654321'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Mock successful auth update
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Mock successful profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: { user_id: userId, display_name_override: 'John Doe', phone: '+1234567890' },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.from.mockReturnValue({
        // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
        update: vi.fn().mockReturnValue({
          // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
          eq: vi.fn().mockReturnValue({
            // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
            select: vi.fn().mockReturnValue({
              // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
              single: mockProfilesUpdate
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          })
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await updateProfileTransactional(userId, patch);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toEqual({
        // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
        user_id: userId,
        // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
        display_name_override: 'John Doe',
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: '+1234567890'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Verify auth.users was updated
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(userId, {
        // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
        user_metadata: {
          // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
          display_name: 'John Doe',
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: '+1234567890'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Verify profiles was updated
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('profiles');
      
      // Verify success logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'profile.transaction.completed',
          // I am keeping this line here because the surrounding profileSync.test.js workflow expects this value or operation before it continues.
          userId
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Transactional profile update completed successfully'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should rollback auth.users if profiles update fails', async () => {
      // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const userId = 'test-user-123';
      // I am saving `patch` here so the nearby steps can reuse the same value without rebuilding it each time.
      const patch = {
        // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
        display_name_override: 'John Doe',
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: '+1234567890'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // Mock successful getUserById (capture original state)
      mockSupabaseAdmin.auth.admin.getUserById
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .mockResolvedValueOnce({
          // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
          data: {
            // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
            user_metadata: { display_name: 'Original Name' },
            // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
            phone: '+0000000000'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: null
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
        // Mock successful rollback getUserById call
        .mockResolvedValueOnce({
          // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
          data: {
            // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
            user_metadata: { display_name: 'Original Name' },
            // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
            phone: '+0000000000'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: null
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });

      // Mock successful auth update (first time)
      // Mock successful rollback (second time)
      mockSupabaseAdmin.auth.admin.updateUserById
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .mockResolvedValueOnce({ error: null })
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .mockResolvedValueOnce({ error: null });

      // Mock failed profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: null,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: { message: 'Database constraint violation' }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.from.mockReturnValue({
        // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
        update: vi.fn().mockReturnValue({
          // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
          eq: vi.fn().mockReturnValue({
            // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
            select: vi.fn().mockReturnValue({
              // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
              single: mockProfilesUpdate
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          })
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am checking the observed value here against the behavior this test promises to protect.
      await expect(updateProfileTransactional(userId, patch)).rejects.toThrow('Profile update failed: Database constraint violation');

      // Verify rollback was attempted
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
      
      // Verify rollback logging
      expect(mockLogger.warn).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'profile.transaction.rollback_success',
          // I am keeping this line here because the surrounding profileSync.test.js workflow expects this value or operation before it continues.
          userId
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Auth users rolled back to original state'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'profile.transaction.profiles_update_failed',
          // I am keeping this line here because the surrounding profileSync.test.js workflow expects this value or operation before it continues.
          userId
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Profiles table update failed - initiating rollback'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle display_name parsing correctly', async () => {
      // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const userId = 'test-user-123';
      // I am saving `patch` here so the nearby steps can reuse the same value without rebuilding it each time.
      const patch = {
        // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
        display_name_override: 'John Michael Doe'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // Mock no auth update needed (display_name_override is null in this test scenario)
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
          user_metadata: {},
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: null
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Mock successful profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
          user_id: userId,
          // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
          display_name_override: 'John Michael Doe',
          // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
          given_name: 'John',
          // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
          family_name: 'Michael Doe'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.from.mockReturnValue({
        // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
        update: vi.fn().mockReturnValue({
          // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
          eq: vi.fn().mockReturnValue({
            // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
            select: vi.fn().mockReturnValue({
              // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
              single: mockProfilesUpdate
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          })
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await updateProfileTransactional(userId, patch);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result.given_name).toBe('John');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result.family_name).toBe('Michael Doe');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle array field processing', async () => {
      // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const userId = 'test-user-123';
      // I am saving `patch` here so the nearby steps can reuse the same value without rebuilding it each time.
      const patch = {
        // I am keeping the `hobbies` field in this object so the receiving code can read that value by its expected name.
        hobbies: 'reading, swimming, coding',
        // I am keeping the `music` field in this object so the receiving code can read that value by its expected name.
        music: 'rock,jazz, classical',
        // I am keeping the `fav_food` field in this object so the receiving code can read that value by its expected name.
        fav_food: 'pizza, sushi'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // Mock no auth update needed
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: { user_metadata: {}, phone: null },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Mock successful profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
          user_id: userId,
          // I am keeping the `hobbies` field in this object so the receiving code can read that value by its expected name.
          hobbies: ['reading', 'swimming', 'coding'],
          // I am keeping the `music` field in this object so the receiving code can read that value by its expected name.
          music: ['rock', 'jazz', 'classical'],
          // I am keeping the `fav_food` field in this object so the receiving code can read that value by its expected name.
          fav_food: ['pizza', 'sushi']
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.from.mockReturnValue({
        // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
        update: vi.fn().mockReturnValue({
          // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
          eq: vi.fn().mockReturnValue({
            // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
            select: vi.fn().mockReturnValue({
              // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
              single: mockProfilesUpdate
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          })
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await updateProfileTransactional(userId, patch);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result.hobbies).toEqual(['reading', 'swimming', 'coding']);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result.music).toEqual(['rock', 'jazz', 'classical']);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result.fav_food).toEqual(['pizza', 'sushi']);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('reconcileProfileData', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect inconsistencies between auth.users and profiles', async () => {
      // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const userId = 'test-user-123';

      // Mock profiles query
      const mockProfilesSelect = vi.fn().mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: [{
          // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
          user_id: userId,
          // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
          display_name_override: 'Profile Name',
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: '+1111111111',
          // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
          given_name: 'Profile',
          // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
          family_name: 'Name'
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        }],
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.from.mockReturnValue({
        // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
        select: vi.fn().mockReturnValue({
          // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
          eq: vi.fn().mockReturnValue({
            // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
            single: mockProfilesSelect
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }),
          // I am keeping the `limit` field in this object so the receiving code can read that value by its expected name.
          limit: mockProfilesSelect
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Mock auth user query (different data)
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
          user_metadata: { display_name: 'Auth Name' },
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: '+2222222222'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `report` here so the nearby steps can reuse the same value without rebuilding it each time.
      const report = await reconcileProfileData(userId);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.checked).toBe(1);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.inconsistencies).toBe(1);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.errors).toBe(0);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.details).toHaveLength(1);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.details[0]).toEqual({
        // I am keeping this line here because the surrounding profileSync.test.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `issue` field in this object so the receiving code can read that value by its expected name.
        issue: 'data_mismatch',
        // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
        auth: { display_name: 'Auth Name', phone: '+2222222222' },
        // I am keeping the `profile` field in this object so the receiving code can read that value by its expected name.
        profile: { display_name: 'Profile Name', phone: '+1111111111' }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should report no inconsistencies when data matches', async () => {
      // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const userId = 'test-user-123';

      // Mock profiles query
      const mockProfilesSelect = vi.fn().mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: [{
          // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
          user_id: userId,
          // I am keeping the `display_name_override` field in this object so the receiving code can read that value by its expected name.
          display_name_override: 'Same Name',
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: '+1111111111',
          // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
          given_name: 'Same',
          // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
          family_name: 'Name'
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        }],
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockSupabaseAdmin.from.mockReturnValue({
        // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
        select: vi.fn().mockReturnValue({
          // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
          eq: vi.fn().mockReturnValue({
            // I am keeping the `single` field in this object so the receiving code can read that value by its expected name.
            single: mockProfilesSelect
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }),
          // I am keeping the `limit` field in this object so the receiving code can read that value by its expected name.
          limit: mockProfilesSelect
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Mock auth user query (same data)
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
          user_metadata: { display_name: 'Same Name' },
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: '+1111111111'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `report` here so the nearby steps can reuse the same value without rebuilding it each time.
      const report = await reconcileProfileData(userId);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.checked).toBe(1);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.inconsistencies).toBe(0);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.errors).toBe(0);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(report.details).toHaveLength(0);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
