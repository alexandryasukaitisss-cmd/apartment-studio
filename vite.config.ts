import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three-vendor';
          if (id.includes('node_modules/react') || id.includes('node_modules/lucide-react')) return 'ui-vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true },
    },
  },
});
