// Description: Vitest configuration for testing
// Purpose: Configure test environment with proper setup
// Notes: Uses setup files for environment and globals

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [
      './test/setupEnv.mjs',
      './test/setupGlobals.mjs'
    ],
    isolate: true,
    sequence: { shuffle: false },
    include: ['__tests__/**/*.test.js'],
    coverage: { 
      reporter: ['text', 'html'] 
    },
    // Support both ESM and CommonJS
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  },
});
