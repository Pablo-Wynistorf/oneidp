import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The SPA is served from S3 behind CloudFront, and the Express API is exposed
// through the same CloudFront distribution under /api, /.well-known and
// /gtag.js. During local development we proxy those prefixes to the local
// Express instance so cookies stay first-party (same origin) exactly like in
// production.
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    fs: {
      // /docs route renders the repository's markdown, which sits one level
      // above the Vite root and has to be readable by the dev server.
      allow: [path.resolve(import.meta.dirname, '..')],
    },
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/.well-known': { target: API_TARGET, changeOrigin: false },
      '/gtag.js': { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Match on resolved paths rather than package names: entry points like
        // `react-dom/client` and `motion/react` are distinct module ids and
        // would otherwise fall back into the main bundle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/ogl/')) return 'gl';
          // The markdown pipeline (unified/remark/micromark) is only needed by
          // the /docs route, so it must not land in the shared vendor chunk.
          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark') ||
            id.includes('/rehype') ||
            id.includes('/micromark') ||
            id.includes('/mdast') ||
            id.includes('/hast') ||
            id.includes('/unified/') ||
            id.includes('/unist-') ||
            id.includes('/vfile')
          ) {
            return 'markdown';
          }
          if (id.includes('/motion') || id.includes('/framer-motion/')) return 'motion';
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
});
