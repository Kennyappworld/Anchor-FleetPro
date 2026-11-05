import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { tokens, refreshSession } from '../services/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // Tokens are not kept here any more: the access token lives in memory
      // (services/api.js) and the refresh token in an httpOnly cookie.
      user: null,
      isAuthenticated: false,

      login: async (email, password, totpCode) => {
        const res = await api.post('/auth/login', { email, password, totpCode });
        const { user, accessToken, requires2FA } = res.data;
        if (requires2FA) return { requires2FA: true };
        tokens.set(accessToken);
        set({ user, isAuthenticated: true });
        return { success: true, user };
      },

      logout: async () => {
        try { await api.post('/auth/logout'); } catch {}
        tokens.clear();
        set({ user: null, isAuthenticated: false });
      },

      refreshAuth: () => refreshSession(),

      // The refresh token arrives as a cookie; only the access token is handed over here.
      setTokens: (accessToken) => tokens.set(accessToken),

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
      version: 1,
      // Sessions saved before tokens moved to a cookie: hand the old refresh token
      // over once (the server swaps it for a cookie), then forget it.
      migrate: (persisted) => {
        if (persisted?.refreshToken) tokens.setLegacy(persisted.refreshToken);
        return { user: persisted?.user ?? null, isAuthenticated: !!persisted?.isAuthenticated };
      },
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
