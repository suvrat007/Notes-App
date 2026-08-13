import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
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
