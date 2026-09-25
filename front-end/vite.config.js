import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['Abraco1.png', 'Abraco5.png', 'Abraco10.png', 'Abraco11.png', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest,woff2}'],
        cleanupOutdatedCaches: true,
      },
      // No iOS, cache pode ser limpo após ~7 dias sem uso.
    })
  ],
})
