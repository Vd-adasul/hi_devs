import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  orgId: string;
  role: string;
  name?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Load initial state from localStorage
  const savedToken = localStorage.getItem('lawyeros_token');
  let savedUser = null;
  try {
    const userStr = localStorage.getItem('lawyeros_user');
    if (userStr) savedUser = JSON.parse(userStr);
  } catch (e) {
    console.error('Failed to parse saved user:', e);
  }

  return {
    user: savedUser,
    token: savedToken,
    isAuthenticated: !!savedToken,
    login: (token: string, user: User) => {
      localStorage.setItem('lawyeros_token', token);
      localStorage.setItem('lawyeros_user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    },
    logout: () => {
      localStorage.removeItem('lawyeros_token');
      localStorage.removeItem('lawyeros_user');
      set({ token: null, user: null, isAuthenticated: false });
    },
  };
});
