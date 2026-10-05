import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  return {
    plugins: [react()],
    base: pages ? '/aikatsu-encore/' : '/',
    // Public images are a private local cache and must never enter a Pages artifact.
    publicDir: pages ? false : 'public',
    build: { outDir: pages ? 'dist-pages' : 'dist' },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1' },
  };
});
