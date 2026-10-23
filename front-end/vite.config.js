import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { env } from 'node:process'

const gitCommit = env.RENDER_GIT_COMMIT || (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()
const appVersion = gitCommit || 'dev'
const gitHash = (gitCommit || 'dev').slice(0, 7)
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

const appVersionPlugin = {
  name: 'app-version',
  configureServer(server) {
    server.middlewares.use('/version.json', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ version: appVersion }))
    })
    server.middlewares.use('/CHANGELOG.md', (_request, response) => {
      response.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      response.end(changelog)
    })
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: appVersion }),
    })
    this.emitFile({
      type: 'asset',
      fileName: 'CHANGELOG.md',
      source: changelog,
    })
  },
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [
    react(),
    appVersionPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['logo.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest,woff2}'],
        globIgnores: ['version.json'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/version.json',
            handler: 'NetworkOnly',
          },
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
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'worker',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'static-scripts',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) => ['style', 'font', 'image'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
            },
          },
        ],
      },
    })
  ],
})
