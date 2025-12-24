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
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/binder-editor/',

  // Prevent Vite from copying binder-editor/public/* into outDir (which would add extra files)
  publicDir: false,

  build: {
    outDir: path.resolve(__dirname, '../server/public/binder-editor'),
    emptyOutDir: true,

    // No .map files
    sourcemap: false,

    // One CSS file
    cssCodeSplit: false,

    // Inline most imported assets (prevents extra files like images/fonts from being emitted)
    // If you import very large assets, this will bloat binder-editor.js instead of emitting files.
    assetsInlineLimit: 10 * 1024 * 1024, // 10MB

    rollupOptions: {
      output: {
        // Force a single JS bundle (no code-split chunks)
        inlineDynamicImports: true,

        // Stable filenames so EJS can reference them directly
        entryFileNames: 'binder-editor.js',

        // With inlineDynamicImports there should be no chunks, but keep safe defaults
        chunkFileNames: 'binder-editor.js',

        // One stable CSS filename
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) return 'binder-editor.css';
          return 'binder-editor.[ext]';
        },

        // Extra safety: prevent vendor/manual chunk splitting
        manualChunks: undefined,
      },
    },

    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },

  server: {
    port: 3001,
    strictPort: false,
  },
});