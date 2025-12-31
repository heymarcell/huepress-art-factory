import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // Don't use any plugins for renderer that could cause ESM issues
  // React will be handled differently
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});
