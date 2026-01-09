import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as loginApi, getMe } from '../utils/api';

const AuthContext = createContext(null);

// Role-based permissions (mirrors backend ROLE_PERMISSIONS)
const ROLE_PERMISSIONS = {
  admin: ['*'], // Full access
  marketing: [
    'dashboard',
    'announcements',
    'campaigns',
    'channels',
    'analytics',
    'click-details',
    'insights'
  ],
  support: [
    'dashboard',
    'inbox',
    'tickets',
    'customers',
    'quick-replies',
    'logs'
  ]
};

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
        localStorage.setItem('xbo_user', JSON.stringify(data.user));
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

  // Check if user has permission for a specific feature
  const hasPermission = useCallback((feature) => {
    if (!user?.role) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    if (permissions.includes('*')) return true;
    return permissions.includes(feature);
  }, [user]);

  // Check if user can access a specific route
  const canAccessRoute = useCallback((path) => {
    if (!user?.role) return false;
    if (user.role === 'admin') return true;

    // Map routes to features
    const routeToFeature = {
      '/': 'dashboard',
      '/announcements': 'announcements',
      '/campaigns': 'campaigns',
      '/channels': 'channels',
      '/analytics': 'analytics',
      '/click-details': 'click-details',
      '/insights': 'insights',
      '/inbox': 'inbox',
      '/tickets': 'tickets',
      '/customers': 'customers',
      '/quick-replies': 'quick-replies',
      '/logs': 'logs',
      '/users': 'admin',
      '/settings': 'settings'
    };

    const feature = routeToFeature[path];
    if (!feature) return true; // Unknown routes allowed
    if (feature === 'admin') return user.role === 'admin';
    if (feature === 'settings') return true; // Everyone can access settings

    return hasPermission(feature);
  }, [user, hasPermission]);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      loading,
      isAdmin: user?.role === 'admin',
      isMarketing: user?.role === 'marketing',
      isSupport: user?.role === 'support',
      hasPermission,
      canAccessRoute,
      permissions: user?.role ? ROLE_PERMISSIONS[user.role] : []
    }}>
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
