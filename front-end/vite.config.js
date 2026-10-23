import { defineConfig, loadEnv } from 'vite'
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

function brandingFromEnv(mode) {
  const e = loadEnv(mode, process.cwd(), '')
  const pick = (key, fallback) => {
    const value = e[key] ?? env[key]
    if (value === undefined || value === null || String(value).trim() === '') return fallback
    return String(value).trim()
  }
  return {
    name: pick('VITE_APP_NAME', 'PDV'),
    shortName: pick('VITE_APP_SHORT_NAME', 'PDV'),
    tagline: pick('VITE_APP_TAGLINE', 'Sistema de atendimento'),
    logoUrl: pick('VITE_APP_LOGO_URL', '/logo.svg'),
    themeColor: pick('VITE_APP_THEME_COLOR', '#4f9d6a'),
    backgroundColor: pick('VITE_APP_BG_COLOR', '#f3f6f1'),
  }
}

function brandingHtmlPlugin(mode) {
  const b = brandingFromEnv(mode)
  return {
    name: 'branding-html-manifest',
    transformIndexHtml(html) {
      return html
        .replace(/<title>[^<]*<\/title>/i, `<title>${b.name}</title>`)
        .replace(/content="[^"]*"(\s*\/?>)/i, (match) => match) // no-op guard
        .replace(/<meta name="theme-color" content="[^"]*"\s*\/?>/i, `<meta name="theme-color" content="${b.themeColor}" />`)
        .replace(/<meta name="background-color" content="[^"]*"\s*\/?>/i, `<meta name="background-color" content="${b.backgroundColor}" />`)
        .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/?>/i, `<meta name="apple-mobile-web-app-title" content="${b.shortName}" />`)
        .replace(/<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${b.tagline}" />`)
    },
    generateBundle() {
      const manifest = {
        name: b.name,
        short_name: b.shortName,
        description: b.tagline,
        theme_color: b.themeColor,
        background_color: b.backgroundColor,
        start_url: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        scope: '/',
        icons: [
          { src: b.logoUrl.startsWith('http') ? b.logoUrl : b.logoUrl, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: b.logoUrl.startsWith('http') ? b.logoUrl : b.logoUrl, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      }
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      })
    },
  }
}

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

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [
    react(),
    appVersionPlugin,
    brandingHtmlPlugin(mode),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['logo.svg'],
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
    }),
  ],
}))
