// File: server/vitest.config.js
// Description: Vitest configuration for enterprise-grade testing
// Purpose: Configure test environment with proper mocking and globals
// Notes: Enables globals for cleaner test syntax

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable global test functions (describe, it, expect, etc.)
    globals: true,
    
    // Test environment
    environment: 'node',
    
    // Test file patterns
    include: ['__tests__/**/*.test.js'],
    
    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '__tests__/',
        'coverage/',
        '*.config.js'
      ]
    },
    
    // Timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Setup files
    setupFiles: [],
    
    // Reporter configuration
    reporter: ['verbose']
  }
});
