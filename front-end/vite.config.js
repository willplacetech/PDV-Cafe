import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Abraco1.png', 'Abraco5.png', 'Abraco10.png', 'Abraco11.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sabor de Abraço',
        short_name: 'Mercado',
        description: 'Cafeteria e sistema de atendimento do Sabor de Abraço',
        theme_color: '#3a2015',
        background_color: '#f8efe7',
        start_url: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        scope: '/',
        icons: [
          {
            src: '/Abraco1.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/Abraco1.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => Boolean(request.headers.get('authorization')) || /\/api(?:\/|$)/.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.destination === 'document' || request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) => ['style', 'script', 'font', 'image', 'worker'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
            },
          },
        ],
      },
      // No iOS, cache pode ser limpo após ~7 dias sem uso.
    })
  ],
})
