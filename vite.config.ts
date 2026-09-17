import { defineConfig } from 'vite';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { port: 5173, strictPort: true, headers: isolation },
  preview: { port: 5173, strictPort: true, headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
