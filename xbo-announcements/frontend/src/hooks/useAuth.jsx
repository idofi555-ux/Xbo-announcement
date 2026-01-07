import { createContext, useContext, useState, useEffect } from 'react';
import { login as loginApi, getMe } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('xbo_token');
    if (token) {
      try {
        const { data } = await getMe();
        setUser(data.user);
      } catch (error) {
        localStorage.removeItem('xbo_token');
        localStorage.removeItem('xbo_user');
      }
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const { data } = await loginApi(email, password);
    localStorage.setItem('xbo_token', data.token);
    localStorage.setItem('xbo_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('xbo_token');
    localStorage.removeItem('xbo_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
