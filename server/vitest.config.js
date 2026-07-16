// File: server/vitest.config.js
// Description: Vitest configuration for testing
// Purpose: Configure test environment with proper setup
// Notes: Uses setup files for environment and globals

import { defineConfig } from 'vitest/config';

// I am exporting this as the main value from vitest.config.js so the module that imports this file receives the intended entry point.
export default defineConfig({
  // I am keeping the `test` field in this object so the receiving code can read that value by its expected name.
  test: {
    // I am keeping the `environment` field in this object so the receiving code can read that value by its expected name.
    environment: 'node',
    // I am keeping the `globals` field in this object so the receiving code can read that value by its expected name.
    globals: true,
    // I am keeping the `setupFiles` field in this object so the receiving code can read that value by its expected name.
    setupFiles: [
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      './test/setupEnv.mjs',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      './test/setupGlobals.mjs'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    ],
    // I am keeping the `isolate` field in this object so the receiving code can read that value by its expected name.
    isolate: true,
    // I am keeping the `sequence` field in this object so the receiving code can read that value by its expected name.
    sequence: { shuffle: false },
    // I am keeping the `include` field in this object so the receiving code can read that value by its expected name.
    include: ['__tests__/**/*.test.js'],
    // I am keeping the `coverage` field in this object so the receiving code can read that value by its expected name.
    coverage: { 
      // I am keeping the `reporter` field in this object so the receiving code can read that value by its expected name.
      reporter: ['text', 'html'] 
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // Support both ESM and CommonJS
    poolOptions: {
      // I am keeping the `threads` field in this object so the receiving code can read that value by its expected name.
      threads: {
        // I am keeping the `singleThread` field in this object so the receiving code can read that value by its expected name.
        singleThread: false
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
