import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

// The auth cookie is httpOnly, so the frontend can't read it directly — the only
// way to know if the session is valid is to ask the server.
export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState('loading'); // loading | authenticated | unauthenticated

  const checkAuth = useCallback(async () => {
    try {
      await api.get('/get-user');
      setStatus('authenticated');
    } catch {
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      await api.post('/logout');
    } finally {
      setStatus('unauthenticated');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ status, setAuthenticated: () => setStatus('authenticated'), logout }}>
      {children}
    </AuthContext.Provider>
  );
};
