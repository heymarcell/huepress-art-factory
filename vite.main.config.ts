import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'electron-store', 'electron-log'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
