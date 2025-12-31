import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/index.ts',
      fileName: () => 'preload.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
