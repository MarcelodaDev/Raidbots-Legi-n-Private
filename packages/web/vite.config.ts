import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.PORT ?? '7331';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      // El servidor de simulación corre aparte durante el desarrollo.
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
