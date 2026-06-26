import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into separate chunks so esbuild/Rollup
        // never has to hold the entire bundle in memory at once.
        //
        // IMPORTANT: react + react-dom + react-router-dom must stay together
        // in one chunk (vendor-react) so they share a single React instance.
        // Do NOT put socket.io-client in the same chunk as React — it caused
        // "React is not defined" on production due to module init order.
        // socket.io-client is already dynamic-imported in realtimeClient.js
        // so it will be code-split automatically; no entry needed here.
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-ui':     ['lucide-react'],
          'vendor-http':   ['axios'],
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
