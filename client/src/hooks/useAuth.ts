import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';

export interface User {
  id: number;
  email: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified: boolean;
  avatar?: string | null;
  age?: number | null;
  dateOfBirth?: string | null;
  bio?: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Subscription & Credits
  ai_credits_balance?: number;
  messages_used_this_month?: number;
  subscriptionTier?: 'freemium' | 'pro' | 'team' | 'enterprise';
  subscriptionStatus?: 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing';
  // Team membership
  teamId?: number | null;
  teamRole?: 'owner' | 'admin' | 'member';
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  username?: string;
  age?: number;
  dateOfBirth?: string;
  bio?: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => void;
  checkAuthStatus: () => Promise<void>;
  updateProfile: (profileData: UpdateProfileData) => Promise<void>;
  getProfile: () => Promise<User>;
}

export interface RegisterData {
  email: string;
  password: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.success && data.user) {
        setUser(data.user);
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
    setLoading(false);
  };

  const register = async (userData: RegisterData) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      if (data.success && data.user) {
        setUser(data.user);
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
    setLoading(false);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  };

  const loginWithGoogle = () => {
    window.location.href = '/api/auth/google';
  };

  const updateProfile = async (profileData: UpdateProfileData) => {
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(profileData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Profile update failed');
      }

      if (data.success && data.profile) {
        setUser(data.profile);
      }
    } catch (error) {
      throw error;
    }
  };

  const getProfile = async (): Promise<User> => {
    try {
      const response = await fetch('/api/user/profile', {
        credentials: 'include'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get profile');
      }

      if (data.success && data.profile) {
        setUser(data.profile);
        return data.profile;
      } else {
        throw new Error('Invalid profile data');
      }
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    checkAuthStatus();
    
    // Check for OAuth success parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      // Remove the parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Re-check auth status to get user data
      checkAuthStatus();
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    loginWithGoogle,
    checkAuthStatus,
    updateProfile,
    getProfile,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}; 