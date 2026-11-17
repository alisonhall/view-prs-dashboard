import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { viewPrsApiForwarderPlugin } from './src/dev/view-prs-api-forwarder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The forwarder passes /view-prs to the app server, in place of Vite's
  // server.proxy, which sometimes stops large responses short (see
  // src/dev/view-prs-api-forwarder.js).
  plugins: [react(), viewPrsApiForwarderPlugin({ target: 'http://localhost:9000' })],
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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/ui'),
      '@helpers': path.resolve(__dirname, 'src/ui/helpers'),
      '@components': path.resolve(__dirname, 'src/ui/components'),
    },
  },
});
