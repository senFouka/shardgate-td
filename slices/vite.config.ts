import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Step 0 visual slices: separate pages, built apart from the game.
const root = resolve(__dirname);

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, '../public'),
  build: {
    target: 'es2020',
    outDir: resolve(root, '../dist-slices'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        '3d': resolve(root, '3d/index.html'),
        towers: resolve(root, 'towers/index.html'),
        audition: resolve(root, 'audition/index.html'),
      },
    },
  },
  server: { host: true, port: 5180 },
});
