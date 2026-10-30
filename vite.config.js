import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Relative, so the build works wherever the page is served: / on the
  // standalone server, /view-prs/ under the hub (src/server/app.js serves
  // dist/ui with NODE_ENV=production). The dev server treats it as /.
  base: './',
  root: path.resolve(__dirname, 'src/ui'),
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'dist/ui'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/ui/index.html'),
      },
    },
  },
  server: {
    port: 3456,
    proxy: {
      '/view-prs': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/ui'),
      '@helpers': path.resolve(__dirname, 'src/ui/helpers'),
      '@components': path.resolve(__dirname, 'src/ui/components'),
    },
  },
});
