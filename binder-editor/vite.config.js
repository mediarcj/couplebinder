// File: binder-editor/vite.config.js
// Description: Vite config for binder-editor with single-file outputs
// Purpose: Produce exactly: index.html, binder-editor.js, binder-editor.css
// Notes:
// - emptyOutDir is REQUIRED because outDir is outside binder-editor project root
// - inlineDynamicImports forces a single JS bundle (no hashed chunks)
// - cssCodeSplit:false forces a single CSS file
// - publicDir:false prevents extra files from being copied into outDir
// - assetsInlineLimit set high to avoid extra asset files (inlines most imports)

import { defineConfig } from 'vite';
// I am importing `react` from `@vitejs/plugin-react` here because vite.config.js uses it in the steps below.
import react from '@vitejs/plugin-react';
// I am importing `path` from `path` here because vite.config.js uses it in the steps below.
import path from 'path';
// I am importing `fileURLToPath` from `url` here because vite.config.js uses it in the steps below.
import { fileURLToPath } from 'url';

// I am saving `__dirname` here so the nearby steps can reuse the same value without rebuilding it each time.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// I am exporting this as the main value from vite.config.js so the module that imports this file receives the intended entry point.
export default defineConfig({
  // I am keeping the `plugins` field in this object so the receiving code can read that value by its expected name.
  plugins: [react()],
  // I am keeping the `base` field in this object so the receiving code can read that value by its expected name.
  base: '/binder-editor/',

  // Prevent Vite from copying binder-editor/public/* into outDir (which would add extra files)
  publicDir: false,

  // I am keeping the `build` field in this object so the receiving code can read that value by its expected name.
  build: {
    // I am keeping the `outDir` field in this object so the receiving code can read that value by its expected name.
    outDir: path.resolve(__dirname, '../server/public/binder-editor'),
    // I am keeping the `emptyOutDir` field in this object so the receiving code can read that value by its expected name.
    emptyOutDir: true,

    // No .map files
    sourcemap: false,

    // One CSS file
    cssCodeSplit: false,

    // Inline most imported assets (prevents extra files like images/fonts from being emitted)
    // If you import very large assets, this will bloat binder-editor.js instead of emitting files.
    assetsInlineLimit: 10 * 1024 * 1024, // 10MB

    // I am keeping the `rollupOptions` field in this object so the receiving code can read that value by its expected name.
    rollupOptions: {
      // I am keeping the `output` field in this object so the receiving code can read that value by its expected name.
      output: {
        // Force a single JS bundle (no code-split chunks)
        inlineDynamicImports: true,

        // Stable filenames so EJS can reference them directly
        entryFileNames: 'binder-editor.js',

        // With inlineDynamicImports there should be no chunks, but keep safe defaults
        chunkFileNames: 'binder-editor.js',

        // One stable CSS filename
        assetFileNames: (assetInfo) => {
          // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
          const name = assetInfo.name || '';
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (name.endsWith('.css')) return 'binder-editor.css';
          // This return sends the completed value or response back to the code that called this function.
          return 'binder-editor.[ext]';
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },

        // Extra safety: prevent vendor/manual chunk splitting
        manualChunks: undefined,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },

    // I am keeping the `minify` field in this object so the receiving code can read that value by its expected name.
    minify: 'terser',
    // I am keeping the `terserOptions` field in this object so the receiving code can read that value by its expected name.
    terserOptions: {
      // I am keeping the `compress` field in this object so the receiving code can read that value by its expected name.
      compress: {
        // I am keeping the `drop_console` field in this object so the receiving code can read that value by its expected name.
        drop_console: false,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `server` field in this object so the receiving code can read that value by its expected name.
  server: {
    // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
    port: 3001,
    // I am keeping the `strictPort` field in this object so the receiving code can read that value by its expected name.
    strictPort: false,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});