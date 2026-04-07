import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE || 'http://localhost:3000',
          changeOrigin: true,
          // Useful if the target is Https and you are on Http locally
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});

