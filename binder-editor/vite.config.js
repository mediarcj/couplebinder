// File: binder-editor/vite.config.js
// Description: Vite configuration for binder editor React app
// Purpose: Build React app as production bundle for Express/EJS integration

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/binder-editor/',
  build: {
    outDir: path.resolve(__dirname, '../server/public/binder-editor'),
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'binder-editor.js',
        chunkFileNames: 'binder-editor-[hash].js',
        assetFileNames: 'binder-editor.[ext]'
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false
      }
    }
  },
  server: {
    port: 3001,
    strictPort: false
  }
});