import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    /**
     * Pinned, and strict, because Google OAuth authorises an EXACT origin. A
     * silent hop to 5174 when 5173 is busy means every other run is rejected
     * with an opaque error, which is far worse to debug than "port in use".
     */
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        /**
         * A stable identity. Without it the app IS its start_url, so moving to
         * a subpath later would read as a brand new app and orphan every
         * existing install.
         */
        id: '/',
        name: 'Focus - Productivity Tracker',
        short_name: 'Focus',
        description: 'Gamified productivity and habit tracker',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        /** Desktop installs (macOS "Add to Dock", Windows Edge/Chrome). */
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Android crops icons to its own shape; without a maskable pair the
          // artwork gets a white circle baked around it.
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        /**
         * React Router owns the URLs, so a hard refresh on /login must be
         * answered with the app shell rather than a 404 from the host.
         */
        navigateFallback: '/index.html',
        /**
         * ...except for anything that is not a page. The API lives on another
         * origin so it is untouched either way, but an OAuth round trip coming
         * back through this origin must never be handed the shell instead.
         */
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/oauth/],
        cleanupOutdatedCaches: true,
        /**
         * The shell is cached; the DATA is not. Habits and stars live on the
         * server and a stale cached response would show yesterday's totals as
         * though they were today's — worse than an honest failure to load.
         */
        runtimeCaching: [],
      },
      devOptions: {
        // Keep the service worker out of dev: it caches aggressively and makes
        // every change look like it did not take.
        enabled: false,
      },
    })
  ],
})
