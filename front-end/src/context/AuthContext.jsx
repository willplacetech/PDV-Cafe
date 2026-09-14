import { useState } from 'react';
import api from '../services/api.jsx';
import { AuthContext } from './AuthContextDefinition.jsx';

export { AuthContext } from './AuthContextDefinition.jsx';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('pdv_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const loading = false;
  
  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('pdv_token', data.token);
    localStorage.setItem('pdv_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
