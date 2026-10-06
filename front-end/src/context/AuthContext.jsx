import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { AuthContext } from './AuthContextDefinition.jsx';
import { canRestoreSession, logoutAccessSession, readCachedProfile, refreshAccessSession, setAccessSession, runSessionLogin } from '../services/accessSession.js';


export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readCachedProfile());
  const [loading, setLoading] = useState(() => navigator.onLine !== false && canRestoreSession());
  useEffect(() => {
    let active = true;
    const change = event => { if (event.detail.scope === 'pdv' && active) setUser(event.detail.user); };
    const restore = async () => {
      if (navigator.onLine === false || !canRestoreSession()) { if (active) setLoading(false); return; }
      try { await refreshAccessSession('pdv', api.defaults.baseURL); }
      catch { /* Cached identity is UI only; API always requires a live bearer. */ }
      finally { if (active) setLoading(false); }
    };
    window.addEventListener('session:change', change);
    window.addEventListener('online', restore);
    restore();
    return () => { active = false; window.removeEventListener('session:change', change); window.removeEventListener('online', restore); };
  }, []);
  
  const login = async (username, password) => {
    const { data } = await runSessionLogin('pdv', () => api.post('/auth/login', { username, password }));
    const profile = setAccessSession('pdv', data);
    setUser(profile);
    return profile;
  };

  const logout = () => {
    logoutAccessSession('pdv', api.defaults.baseURL);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
