import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Raise the warning threshold — 1.74MB bundle is expected for this app
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split large vendor libraries into separate chunks so Rollup doesn't
        // have to hold the entire bundle in memory at once during minification.
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui':      ['lucide-react'],
          'vendor-charts':  ['recharts'],
          'vendor-utils':   ['axios'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 5173, protocol: 'wss' },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
})
