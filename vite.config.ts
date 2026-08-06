import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  /*
   * GitHub Pages serves this project from https://<user>.github.io/Molforge/,
   * so built asset URLs need that prefix or every request 404s. The workflow
   * sets BASE_PATH; local dev and previews fall back to '/'.
   */
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  define: {
    // Ketcher expects Node-style process.env and a browser global
    'process.env': {},
    global: 'window',
  },
  optimizeDeps: {
    include: ['ketcher-react', 'ketcher-standalone', 'ketcher-core'],
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 5173,
  },
})
