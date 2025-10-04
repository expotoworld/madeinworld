import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on app load
  useEffect(() => {
    (async () => {
      const savedToken = localStorage.getItem('admin_token');
      const savedUser = localStorage.getItem('admin_user');
      const savedRefresh = localStorage.getItem('admin_refresh_token');

      try {
        const userData = savedUser ? JSON.parse(savedUser) : null;
        const tokenData = savedToken ? JSON.parse(savedToken) : null;
        const refreshData = savedRefresh ? JSON.parse(savedRefresh) : null;

        const hasValidAccess = tokenData?.expiresAt && new Date(tokenData.expiresAt) > new Date();
        if (hasValidAccess && tokenData?.token && userData) {
          setToken(tokenData.token);
          setUser(userData);
          setIsAuthenticated(true);
          axios.defaults.headers.common['Authorization'] = `Bearer ${tokenData.token}`;
        } else if (refreshData?.refresh_token) {
          // Try silent refresh WITHOUT rotating the refresh token
          const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
          try {
            const resp = await axios.post(`${API_BASE}/api/auth/token/refresh`, { refresh_token: refreshData.refresh_token, rotate: false });
            const newToken = resp.data?.token;
            const expiresAt = resp.data?.expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString();
            if (newToken) {
              localStorage.setItem('admin_token', JSON.stringify({ token: newToken, expiresAt }));
              setToken(newToken);
              if (userData) setUser(userData);
              setIsAuthenticated(true);
              axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
            } else {
              logout();
            }
          } catch (e) {
            console.warn('Silent refresh failed on init', e);
            logout();
          }
        }
      } catch (error) {
        console.error('Error parsing stored auth data:', error);
        logout();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      
      // Call auth service login endpoint via Worker
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
      const response = await axios.post(`${API_BASE}/api/auth/login`, {
        email,
        password
      });

      const { token: authToken, user: userData, expiresAt, refresh_token, refresh_expires_at } = response.data;

      // Store token and user data
      const tokenData = {
        token: authToken,
        expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Default 24h
      };

      localStorage.setItem('admin_token', JSON.stringify(tokenData));
      localStorage.setItem('admin_user', JSON.stringify(userData));
      if (refresh_token && refresh_expires_at) {
        localStorage.setItem('admin_refresh_token', JSON.stringify({ refresh_token, refresh_expires_at }));
      }

      // Set state
      setToken(authToken);
      setUser(userData);
      setIsAuthenticated(true);

      // Set default authorization header for all future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed'
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // Clear storage
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    
    // Clear state
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    
    // Remove authorization header
    delete axios.defaults.headers.common['Authorization'];
  };

  const refreshToken = useCallback(async () => {
    try {
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
      const refreshRaw = localStorage.getItem('admin_refresh_token');
      const refreshData = refreshRaw ? JSON.parse(refreshRaw) : null;
      const rt = refreshData?.refresh_token;
      if (!rt) throw new Error('No refresh token');
      const response = await axios.post(`${API_BASE}/api/auth/token/refresh`, { refresh_token: rt, rotate: false });

      const { token: newToken, expires_at } = response.data;

      const tokenData = {
        token: newToken,
        expiresAt: expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString()
      };

      localStorage.setItem('admin_token', JSON.stringify(tokenData));
      setToken(newToken);

      // Update authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      return false;
    }
  }, []);

  // Auto-refresh token before expiration
  useEffect(() => {
    if (!token || !isAuthenticated) return;

    const savedToken = localStorage.getItem('admin_token');
    if (!savedToken) return;

    try {
      const tokenData = JSON.parse(savedToken);
      const expiresAt = new Date(tokenData.expiresAt);
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      
      // Refresh token 5 minutes before expiry
      const refreshTime = timeUntilExpiry - (5 * 60 * 1000);
      
      if (refreshTime > 0) {
        const timeoutId = setTimeout(() => {
          refreshToken();
        }, refreshTime);
        
        return () => clearTimeout(timeoutId);
      } else if (timeUntilExpiry <= 0) {
        // Token already expired
        logout();
      }
    } catch (error) {
      console.error('Error setting up token refresh:', error);
    }
  }, [token, isAuthenticated, refreshToken]);

  const value = {
    isAuthenticated,
    token,
    user,
    loading,
    login,
    logout,
    refreshToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
