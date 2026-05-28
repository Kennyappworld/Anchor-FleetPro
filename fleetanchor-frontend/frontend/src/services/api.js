import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor — attach token ───────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Get token from Zustand persisted store
    try {
      const stored = JSON.parse(localStorage.getItem('fleetanchor-auth') || '{}');
      const token = stored?.state?.accessToken;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {}
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor — handle 401 / token refresh ────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => (error ? prom.reject(error) : prom.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry && error.response?.data?.code === 'TOKEN_EXPIRED') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const stored = JSON.parse(localStorage.getItem('fleetanchor-auth') || '{}');
        const refreshToken = stored?.state?.refreshToken;
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post('/api/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data;

        // Update stored tokens
        const parsedStore = JSON.parse(localStorage.getItem('fleetanchor-auth') || '{}');
        if (parsedStore.state) {
          parsedStore.state.accessToken = accessToken;
          parsedStore.state.refreshToken = newRefresh;
          localStorage.setItem('fleetanchor-auth', JSON.stringify(parsedStore));
        }

        processQueue(null, accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('fleetanchor-auth');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// ─── Service helpers ──────────────────────────────────────────────────────────
export const authService = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  verifyOtp: (data) => api.post('/auth/verify-otp', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  setup2FA: () => api.post('/auth/2fa/setup'),
  verify2FA: (code) => api.post('/auth/2fa/verify', { code }),
  register: (data) => api.post('/auth/register', data),
};

export const jobService = {
  list: (params) => api.get('/jobs', { params }),
  get: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs', data),
  updateStatus: (id, data) => api.patch(`/jobs/${id}/status`, data),
  respondToEstimate: (id, data) => api.post(`/jobs/${id}/estimate-response`, data),
  vehicleHistory: (params) => api.get('/jobs/vehicle-history', { params }),
};

export const vehicleService = {
  list: (params) => api.get('/vehicles', { params }),
  get: (id) => api.get(`/vehicles/${id}`),
  create: (data) => api.post('/vehicles', data),
  search: (query) => api.get('/vehicles/search', { params: { q: query } }),
};

export const vendorService = {
  list: (params) => api.get('/vendors', { params }),
  get: (id) => api.get(`/vendors/${id}`),
  create: (data) => api.post('/vendors', data),
  suspend: (id, data) => api.post(`/vendors/${id}/suspend`, data),
  reinstate: (id) => api.post(`/vendors/${id}/reinstate`),
};

export const estimateService = {
  create: (data) => api.post('/estimates', data),
  update: (id, data) => api.put(`/estimates/${id}`, data),
};

export const invoiceService = {
  list: (params) => api.get('/invoices', { params }),
  get: (id) => api.get(`/invoices/${id}`),
  confirmPayment: (id) => api.post(`/invoices/${id}/confirm-payment`),
  generatePdf: (id) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
};

export const analyticsService = {
  dashboard: (params) => api.get('/analytics/dashboard', { params }),
  revenue: (params) => api.get('/analytics/revenue', { params }),
  vehicles: (params) => api.get('/analytics/vehicles', { params }),
};

export const auditService = {
  list: (params) => api.get('/audit', { params }),
  verify: () => api.get('/audit/verify'),
  export: (params) => api.get('/audit/export', { params, responseType: 'blob' }),
};

export const subscriptionService = {
  list: () => api.get('/subscriptions'),
  initiate: (data) => api.post('/subscriptions/initiate', data),
  cancel: (id) => api.post(`/subscriptions/${id}/cancel`),
};

export const userService = {
  list: (params) => api.get('/users', { params }),
  create: (data) => api.post('/auth/register', data),
  suspend: (id) => api.post(`/users/${id}/suspend`),
  reinstate: (id) => api.post(`/users/${id}/reinstate`),
};
