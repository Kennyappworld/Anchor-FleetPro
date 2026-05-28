import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password, totpCode) => {
        const res = await api.post('/auth/login', { email, password, totpCode });
        const { user, accessToken, refreshToken, requires2FA } = res.data;
        if (requires2FA) return { requires2FA: true };
        set({ user, accessToken, refreshToken, isAuthenticated: true });
        return { success: true, user };
      },

      logout: async () => {
        try { await api.post('/auth/logout'); } catch {}
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) throw new Error('No refresh token');
        const res = await api.post('/auth/refresh', { refreshToken });
        set({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken });
        return res.data.accessToken;
      },

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setUser: (userData) => set({ user: userData }),

      updateUser: (userData) => set((state) => ({ user: { ...state.user, ...userData } })),

      hasRole: (...roles) => {
        const { user } = get();
        return user && roles.includes(user.role);
      },

      isVendor: () => {
        const { user } = get();
        return user && ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT'].includes(user.role);
      },

      isWorkshop: () => {
        const { user } = get();
        return user && ['SUPER_ADMIN', 'OEM_ADMIN', 'WORKSHOP_STAFF'].includes(user.role);
      },
    }),
    {
      name: 'fleetanchor-auth',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken, refreshToken: state.refreshToken, isAuthenticated: state.isAuthenticated }),
    }
  )
);
