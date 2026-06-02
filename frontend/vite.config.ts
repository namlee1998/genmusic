import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './tests/setup.ts',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('@remix-run') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              if (id.includes('framer-motion') || id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('axios') || id.includes('zustand') || id.includes('i18next')) {
                return 'vendor-core';
              }
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
