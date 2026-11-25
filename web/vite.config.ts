import { defineConfig } from 'vite';

// The app uses top-level await (loading before the first frame), so target ES2022 browsers.
// BASE is set by the GitHub Pages build, where the site lives under /<repo>/.
export default defineConfig({
  base: process.env.BASE || '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { port: 5500 },
});
