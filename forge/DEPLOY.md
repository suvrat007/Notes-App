# Deploying FORGE

FORGE is a **static front-end**. It has no server of its own: habits, logs and
stars live in the browser's IndexedDB, and the only network calls go straight
from the browser to Groq and Google. So there is nothing to run on Render — one
static host is the whole deployment.

## Vercel

Import the repo, then set **Root Directory to `forge`**. Everything else
(`framework`, `buildCommand`, `outputDirectory`, caching, SPA rewrites) comes
from `vercel.json` in this folder.

### Environment variables — set these in the Vercel dashboard

They are **not** in the repo (`.env` is gitignored), so pushing alone will not
carry them. Project → Settings → Environment Variables:

| Name | Needed for | Without it |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | signing in | the login page says sign-in is switched off, and nobody gets in |
| `VITE_GROQ_API_KEY` | voice + AI parsing | speech and smart parsing fall back to the on-device rules parser |

Add them for **Production, Preview and Development**, then redeploy — Vite
inlines these at BUILD time, so changing one does nothing until a fresh build.

> Both values ship inside the JavaScript bundle and are readable by anyone who
> opens devtools. That is unavoidable for a browser-only app and is why there is
> no client *secret* anywhere in here. The Groq key in particular is spendable:
> if this is ever more than a personal install, put a small proxy in front of it.

### Google OAuth

Console → APIs & Services → Credentials → your OAuth client →
**Authorized JavaScript origins**:

```
https://<your-project>.vercel.app
http://localhost:5173
```

No redirect URI is needed — the browser token flow does not use one. The origin
must be **HTTPS** in production; Google rejects anything else, and iOS will not
install a PWA over plain HTTP either.

Preview deployments get a different URL each time, so sign-in only works on the
production domain unless you add each preview origin by hand.

## Checking it worked

1. Open the production URL — the login page should appear, not the tracker.
2. Sign in with Google. If the button says sign-in is switched off, the env var
   did not reach the build.
3. Install it (Chrome: install icon in the address bar; iOS Safari: Share →
   Add to Home Screen; macOS Safari: File → Add to Dock).
4. Turn off the network and reopen it. A signed-in device must still open and
   still let you log a habit. That is the whole point of the offline cache.
