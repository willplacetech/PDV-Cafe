import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'
import { env } from 'node:process'

let appVersion = 'dev'
try {
  // Try to get git hash from Render environment variable first, then fallback to local git
  const fullHash = env.RENDER_GIT_COMMIT || 
    execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() ||
    'dev'
  appVersion = (fullHash || 'dev').slice(0, 7)
} catch (_) {
  // If we are not in a git repo or git fails, we keep 'dev'
  appVersion = 'dev'
}

const appVersionPlugin = {
  name: 'app-version',
  configureServer(server) {
    server.middlewares.use('/version.json', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ version: appVersion }))
    })
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: appVersion }),
    })
  },
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    appVersionPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'Abraco1.png',
        'Abraco5.png',
        'Abraco10.png',
        'Abraco11.png',
        'apple-touch-icon.png'
      ],
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,json,webmanifest,woff2}'
        ],
        globIgnores: [
          'version.json',
          'sw.js',
          'workbox-*.js'
        ],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/version.json',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request, url }) => 
              Boolean(request.headers.get('authorization')) || 
              /\/api(?:\/|$)/.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => 
              request.destination === 'document' || 
              request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) => 
              ['style', 'script', 'font', 'image', 'worker'].includes(request.destination),
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
