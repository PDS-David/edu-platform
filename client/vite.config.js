import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Single bundle, deliberately. manualChunks was tried (3dcb368) to
    // reduce build memory pressure, but chunk splitting caused
    // "React is not defined" twice, via two unrelated mechanisms:
    //   1. Module init-order bugs within a single fresh page load — see the
    //      removed comment that documented socket.io-client breaking React
    //      when grouped into the same chunk, independent of any caching.
    //   2. A deploy that changes the chunk graph produces new chunk
    //      filenames; a browser with the old index.html cached (referencing
    //      chunk names that no longer exist) gets a 404 instead of React.
    // The OOM build crash this was solving is handled via NODE_OPTIONS in
    // client/Dockerfile instead — a heap ceiling increase is a much smaller,
    // more contained change than restructuring the bundle graph, and it does
    // not introduce either of the failure modes above.
    chunkSizeWarningLimit: 2500,
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
