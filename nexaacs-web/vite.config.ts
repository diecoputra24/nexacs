import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'zustand', 'axios'],
          'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-charts': ['echarts'],
        },
      },
    },
  },
  server: {
    port: 8000,
    proxy: {
      '/healthz': {
        target: 'http://127.0.0.1:7557',
        changeOrigin: true,
      },
      '/api/v1': {
        target: 'http://127.0.0.1:7557',
        changeOrigin: true,
      },
      '/ws/v1': {
        target: 'ws://127.0.0.1:7557',
        ws: true,
      },
    },
  },
});
