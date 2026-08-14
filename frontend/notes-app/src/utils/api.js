import axios from 'axios';

/*
 * Where the API lives.
 *
 * In a built app this is "/api", which vercel.json rewrites to the backend —
 * so the browser only ever talks to the origin it is already on. That is not
 * a preference: calling the backend's own domain makes every request
 * cross-site and every auth cookie third-party, which Brave blocks outright
 * and Safari drops, with no error anywhere to explain it.
 *
 * It is a constant of the deployment rather than configuration, so it lives
 * here rather than in an env file. VITE_API_URL still overrides it, which is
 * what local development uses and what a different host would need.
 */
const baseURL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:8000');

const api = axios.create({
  baseURL,
  withCredentials: true, // send/receive the httpOnly auth cookie
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // The /get-user probe is expected to 401 whenever the user isn't logged in —
    // AuthContext handles that via React state, not a hard navigation. Only force
    // a redirect when an *already-authenticated* page's call gets rejected (e.g.
    // an expired session), and never while sitting on the public auth pages.
    const onPublicPage = location.pathname === '/login' || location.pathname === '/signup';
    const isAuthProbe = error.config?.url?.endsWith('/get-user');
    if (error.response?.status === 401 && !onPublicPage && !isAuthProbe) {
      location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default api;
