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
    const savedToken = localStorage.getItem('admin_token');
    const savedUser = localStorage.getItem('admin_user');
    
    if (savedToken && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        const tokenData = JSON.parse(savedToken);
        
        // Check if token is expired
        if (tokenData.expiresAt && new Date(tokenData.expiresAt) > new Date()) {
          setToken(tokenData.token);
          setUser(userData);
          setIsAuthenticated(true);
          
          // Set default authorization header
          axios.defaults.headers.common['Authorization'] = `Bearer ${tokenData.token}`;
        } else {
          // Token expired, clear storage
          logout();
        }
      } catch (error) {
        console.error('Error parsing stored auth data:', error);
        logout();
      }
    }
    setLoading(false);
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

      const { token: authToken, user: userData, expiresAt } = response.data;
      
      // Store token and user data
      const tokenData = {
        token: authToken,
        expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Default 24h
      };
      
      localStorage.setItem('admin_token', JSON.stringify(tokenData));
      localStorage.setItem('admin_user', JSON.stringify(userData));
      
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
      const response = await axios.post(`${API_BASE}/api/auth/refresh`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const { token: newToken, expiresAt } = response.data;
      
      const tokenData = {
        token: newToken,
        expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
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
  }, [token]);

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
