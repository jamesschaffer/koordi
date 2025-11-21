import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Get current user on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await apiClient.get<User>('/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setUser(response);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      // Get OAuth URL from backend
      const response = await apiClient.get<{ url: string }>('/auth/google');
      // Redirect to Google OAuth
      window.location.href = response.url;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    window.location.href = '/';
  };

  const setToken = (token: string) => {
    localStorage.setItem('auth_token', token);
    fetchCurrentUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
