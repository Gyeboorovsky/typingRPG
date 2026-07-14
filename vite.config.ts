import { defineConfig } from 'vite';

// GitHub Pages serves at /typingRPG/; the Tauri desktop build loads from /.
export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? '/' : '/typingRPG/',
  build: { target: 'es2022' },
  server: { port: Number(process.env.PORT) || 5173 },
});
