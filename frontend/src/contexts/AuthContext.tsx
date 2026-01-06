import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiClient } from '../lib/api';
import { syncAllCalendars } from '../lib/api-calendars';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  home_address?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  syncing: boolean;
  login: () => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const hasSyncedRef = useRef(false);

  // Trigger calendar sync after user is loaded (fire-and-forget)
  const triggerBackgroundSync = async (authToken: string) => {
    // Only sync once per app load
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    setSyncing(true);
    try {
      console.log('[Auth] Starting background calendar sync...');
      const result = await syncAllCalendars(authToken);
      console.log(`[Auth] Calendar sync complete: ${result.successCount}/${result.totalCalendars} calendars synced`);
    } catch (error) {
      // Don't fail login if sync fails - just log it
      console.error('[Auth] Background sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  // Get current user on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setTokenState(storedToken);
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

      // Trigger background sync after user is loaded (non-blocking)
      triggerBackgroundSync(token);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
      setTokenState(null);
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
    setTokenState(null);
    window.location.href = '/';
  };

  const setToken = (newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    setTokenState(newToken);
    fetchCurrentUser();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, syncing, login, logout, setToken, refreshUser: fetchCurrentUser }}>
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
