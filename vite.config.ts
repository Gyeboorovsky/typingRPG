import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// GitHub Pages serves at /typingRPG/; the Tauri desktop build loads from /.
// preview.html is the map-preview tool (real renderer, no sim) — a second page.
export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? '/' : '/typingRPG/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        preview: resolve(__dirname, 'preview.html'),
      },
    },
  },
  server: { port: Number(process.env.PORT) || 5173 },
});
