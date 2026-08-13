import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  server: {
    /**
     * Pinned, and `strictPort` so a busy 5173 is a loud failure rather than a
     * silent hop to 5174. Google OAuth authorises an exact origin — a drifting
     * dev port means every other run is rejected with an opaque error, which
     * is far worse to debug than "port already in use".
     */
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        /**
         * A stable manifest id. Without one the identity is start_url, so
         * moving the app to a subpath later would read as a NEW app and
         * orphan every existing install.
         */
        id: '/',
        name: 'FORGE',
        short_name: 'FORGE',
        description: 'Gamified habit and task tracker.',
        theme_color: '#0d0f12',
        background_color: '#0d0f12',
        display: 'standalone',
        /**
         * Desktop (macOS Safari "Add to Dock", Windows Edge/Chrome install)
         * gets a real window; anything that understands neither falls back to
         * standalone, and iOS ignores this field entirely in favour of the
         * apple-mobile-web-app-capable meta tag.
         */
        display_override: ['standalone', 'minimal-ui'],
        /**
         * Phones only. A locked orientation on a desktop window is nonsense,
         * and Chromium ignores it there, but iOS and Android honour it — which
         * is where FORGE is actually held one-handed.
         */
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole shell. FORGE has no API to call, so once the
        // shell is cached the app is fully functional offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        /**
         * Never serve the app shell in place of an OAuth round-trip. Google's
         * sign-in popup navigates back through this origin, and answering that
         * navigation with index.html would hand the popup the app instead of
         * the token — sign-in would hang with no error to show for it.
         */
        navigateFallbackDenylist: [/^\/oauth/, /^\/auth/, /__\/auth/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Lets the offline path be exercised in dev too.
        enabled: false,
      },
    }),
  ],
});
