import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

/**
 * Refuse to ship a build that cannot reach its own backend.
 *
 * Vite replaces `import.meta.env.VITE_*` with string literals AT BUILD TIME,
 * so a variable missing from the build environment is not "unset at runtime" —
 * it is absent from the bundle for good, and no amount of setting it in a
 * dashboard afterwards changes the file already being served.
 *
 * That combined with `VITE_API_URL || 'http://localhost:8000'` shipped a
 * production bundle that told every phone to call itself. It failed as a
 * network error with nothing pointing at the cause. A build that cannot work
 * should not complete, so this stops it while someone is still watching.
 *
 * Only VITE_API_URL is fatal. The other two degrade VISIBLY — the app says
 * Google sign-in is unconfigured, and hides voice input — so they warn rather
 * than block, and a deploy that deliberately omits them still builds.
 */
function checkEnv(mode) {
  if (mode !== 'production') return;

  // The third argument lifts the VITE_ prefix filter, so a var set in the host's
  // environment (Vercel, CI) is seen as well as one from a .env file.
  const env = loadEnv(mode, process.cwd(), '');
  const url = (env.VITE_API_URL || '').trim();
  const problems = [];

  if (!url) {
    problems.push(
      'VITE_API_URL is not set.\n'
      + '      Without it the bundle hard-codes http://localhost:8000, which on any\n'
      + '      device other than the build machine means "call yourself".',
    );
  } else {
    // An HTTPS page cannot call an HTTP origin; the browser blocks it as mixed
    // content, and the failure again looks like a plain network error.
    if (url.startsWith('http://') && !/^http:\/\/localhost[:/]/.test(url)) {
      problems.push(`VITE_API_URL is http:// (${url}).\n`
        + '      A page served over HTTPS is blocked from calling it.');
    }
    if (url.endsWith('/')) {
      problems.push(`VITE_API_URL ends with a slash (${url}).\n`
        + '      Axios joins paths onto it directly, producing //logs.');
    }
  }

  if (problems.length) {
    throw new Error(
      '\n\n  This build would not work once deployed:\n\n'
      + problems.map((p) => `    - ${p}`).join('\n\n')
      + '\n\n  Set it in your host\'s environment for the PRODUCTION scope, then\n'
      + '  rebuild WITHOUT the build cache. These values are baked in at build\n'
      + '  time, so a cached build keeps the old ones.\n',
    );
  }

  for (const [name, what] of [
    ['VITE_GOOGLE_CLIENT_ID', 'Google sign-in will be offered but disabled'],
    ['VITE_GROQ_API_KEY', 'voice input will be hidden'],
  ]) {
    if (!(env[name] || '').trim()) {
      console.warn(`  [env] ${name} is not set - ${what}.`);
    }
  }
}

export default defineConfig(({ mode }) => {
  checkEnv(mode);
  return {
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
  };
})
