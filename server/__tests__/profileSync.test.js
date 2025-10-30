// File: server/__tests__/profileSync.test.js
// Description: Tests for transactional profile synchronization
// Purpose: Ensure profile updates maintain consistency between auth.users and profiles
// Notes: Tests both success and failure scenarios with rollback

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateProfileTransactional, reconcileProfileData } from '../services/profileSyncService';

// Mock Supabase admin client
const mockSupabaseAdmin = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn()
    }
  },
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn()
      })),
      limit: vi.fn()
    }))
  }))
};

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

// Mock modules
vi.mock('../utils/supabaseClient', () => ({
  supabaseAdmin: mockSupabaseAdmin
}));

vi.mock('../utils/logger', () => mockLogger);

describe('Profile Synchronization Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('updateProfileTransactional', () => {
    it('should successfully update both auth.users and profiles', async () => {
      const userId = 'test-user-123';
      const patch = {
        display_name_override: 'John Doe',
        phone: '+1234567890'
      };

      // Mock successful getUserById
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: {
          user_metadata: { display_name: 'Old Name' },
          phone: '+0987654321'
        },
        error: null
      });

      // Mock successful auth update
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        error: null
      });

      // Mock successful profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        data: { user_id: userId, display_name_override: 'John Doe', phone: '+1234567890' },
        error: null
      });
      
      mockSupabaseAdmin.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockProfilesUpdate
            })
          })
        })
      });

      const result = await updateProfileTransactional(userId, patch);

      expect(result).toEqual({
        user_id: userId,
        display_name_override: 'John Doe',
        phone: '+1234567890'
      });

      // Verify auth.users was updated
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(userId, {
        user_metadata: {
          display_name: 'John Doe',
          phone: '+1234567890'
        }
      });

      // Verify profiles was updated
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('profiles');
      
      // Verify success logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'profile.transaction.completed',
          userId
        }),
        'Transactional profile update completed successfully'
      );
    });

    it('should rollback auth.users if profiles update fails', async () => {
      const userId = 'test-user-123';
      const patch = {
        display_name_override: 'John Doe',
        phone: '+1234567890'
      };

      // Mock successful getUserById (capture original state)
      mockSupabaseAdmin.auth.admin.getUserById
        .mockResolvedValueOnce({
          data: {
            user_metadata: { display_name: 'Original Name' },
            phone: '+0000000000'
          },
          error: null
        })
        // Mock successful rollback getUserById call
        .mockResolvedValueOnce({
          data: {
            user_metadata: { display_name: 'Original Name' },
            phone: '+0000000000'
          },
          error: null
        });

      // Mock successful auth update (first time)
      // Mock successful rollback (second time)
      mockSupabaseAdmin.auth.admin.updateUserById
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      // Mock failed profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database constraint violation' }
      });
      
      mockSupabaseAdmin.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockProfilesUpdate
            })
          })
        })
      });

      await expect(updateProfileTransactional(userId, patch)).rejects.toThrow('Profile update failed: Database constraint violation');

      // Verify rollback was attempted
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
      
      // Verify rollback logging
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'profile.transaction.rollback_success',
          userId
        }),
        'Auth users rolled back to original state'
      );

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'profile.transaction.profiles_update_failed',
          userId
        }),
        'Profiles table update failed - initiating rollback'
      );
    });

    it('should handle display_name parsing correctly', async () => {
      const userId = 'test-user-123';
      const patch = {
        display_name_override: 'John Michael Doe'
      };

      // Mock no auth update needed (display_name_override is null in this test scenario)
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: {
          user_metadata: {},
          phone: null
        },
        error: null
      });

      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        error: null
      });

      // Mock successful profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        data: {
          user_id: userId,
          display_name_override: 'John Michael Doe',
          given_name: 'John',
          family_name: 'Michael Doe'
        },
        error: null
      });
      
      mockSupabaseAdmin.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockProfilesUpdate
            })
          })
        })
      });

      const result = await updateProfileTransactional(userId, patch);

      expect(result.given_name).toBe('John');
      expect(result.family_name).toBe('Michael Doe');
    });

    it('should handle array field processing', async () => {
      const userId = 'test-user-123';
      const patch = {
        hobbies: 'reading, swimming, coding',
        music: 'rock,jazz, classical',
        fav_food: 'pizza, sushi'
      };

      // Mock no auth update needed
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: { user_metadata: {}, phone: null },
        error: null
      });

      // Mock successful profiles update
      const mockProfilesUpdate = vi.fn().mockResolvedValue({
        data: {
          user_id: userId,
          hobbies: ['reading', 'swimming', 'coding'],
          music: ['rock', 'jazz', 'classical'],
          fav_food: ['pizza', 'sushi']
        },
        error: null
      });
      
      mockSupabaseAdmin.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockProfilesUpdate
            })
          })
        })
      });

      const result = await updateProfileTransactional(userId, patch);

      expect(result.hobbies).toEqual(['reading', 'swimming', 'coding']);
      expect(result.music).toEqual(['rock', 'jazz', 'classical']);
      expect(result.fav_food).toEqual(['pizza', 'sushi']);
    });
  });

  describe('reconcileProfileData', () => {
    it('should detect inconsistencies between auth.users and profiles', async () => {
      const userId = 'test-user-123';

      // Mock profiles query
      const mockProfilesSelect = vi.fn().mockResolvedValue({
        data: [{
          user_id: userId,
          display_name_override: 'Profile Name',
          phone: '+1111111111',
          given_name: 'Profile',
          family_name: 'Name'
        }],
        error: null
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockProfilesSelect
          }),
          limit: mockProfilesSelect
        })
      });

      // Mock auth user query (different data)
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: {
          user_metadata: { display_name: 'Auth Name' },
          phone: '+2222222222'
        },
        error: null
      });

      const report = await reconcileProfileData(userId);

      expect(report.checked).toBe(1);
      expect(report.inconsistencies).toBe(1);
      expect(report.errors).toBe(0);
      expect(report.details).toHaveLength(1);
      expect(report.details[0]).toEqual({
        userId,
        issue: 'data_mismatch',
        auth: { display_name: 'Auth Name', phone: '+2222222222' },
        profile: { display_name: 'Profile Name', phone: '+1111111111' }
      });
    });

    it('should report no inconsistencies when data matches', async () => {
      const userId = 'test-user-123';

      // Mock profiles query
      const mockProfilesSelect = vi.fn().mockResolvedValue({
        data: [{
          user_id: userId,
          display_name_override: 'Same Name',
          phone: '+1111111111',
          given_name: 'Same',
          family_name: 'Name'
        }],
        error: null
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockProfilesSelect
          }),
          limit: mockProfilesSelect
        })
      });

      // Mock auth user query (same data)
      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: {
          user_metadata: { display_name: 'Same Name' },
          phone: '+1111111111'
        },
        error: null
      });

      const report = await reconcileProfileData(userId);

      expect(report.checked).toBe(1);
      expect(report.inconsistencies).toBe(0);
      expect(report.errors).toBe(0);
      expect(report.details).toHaveLength(0);
    });
  });
});
