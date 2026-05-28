import axios from "axios";

const RAILWAY_URL = "https://anchor-fleetpro-production.up.railway.app";
const API_BASE = RAILWAY_URL + "/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(
  (config) => {
    try {
      const stored = JSON.parse(localStorage.getItem("fleetanchor-auth") || "{}");
      const token = stored?.state?.accessToken;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {}
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const stored = JSON.parse(localStorage.getItem("fleetanchor-auth") || "{}");
        const refreshToken = stored?.state?.refreshToken;
        if (refreshToken) {
          const res = await axios.post(`${RAILWAY_URL}/api/auth/refresh`, { refreshToken });
          const { accessToken } = res.data.data;
          const newStored = { ...stored, state: { ...stored.state, accessToken } };
          localStorage.setItem("fleetanchor-auth", JSON.stringify(newStored));
          original.headers.Authorization = `Bearer ${accessToken}`;
          return api(original);
        }
      } catch {}
      localStorage.removeItem("fleetanchor-auth");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

export const authService = {
  login: (data) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  refresh: (rt) => api.post("/auth/refresh", { refreshToken: rt }),
  forgotPassword: (email, accountType) => api.post("/auth/forgot-password", { email, accountType }),
  verifyOtp: (email, otp) => api.post("/auth/verify-otp", { email, otp }),
  resetPassword: (token, password) => api.post("/auth/reset-password", { token, password }),
  checkVendorInvite: (token) => api.get(`/auth/vendor-invite/${token}`),
  acceptVendorInvite: (data) => api.post("/auth/vendor-setup", data),
  changePassword: (currentPassword, newPassword) => api.post("/auth/change-password", { currentPassword, newPassword }),
};

export const jobService = {
  list: (params) => api.get("/jobs", { params }),
  getOne: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post("/jobs", data),
  updateStatus: (id, data) => api.patch(`/jobs/${id}/status`, data),
};

export const vehicleService = {
  list: (params) => api.get("/vehicles", { params }),
  search: (q) => api.get("/vehicles/search", { params: { q } }),
  getOne: (id) => api.get(`/vehicles/${id}`),
  history: (id, hideCost) => api.get(`/vehicles/${id}/history`, { params: { hideCost } }),
  create: (data) => api.post("/vehicles", data),
  update: (id, data) => api.patch(`/vehicles/${id}`, data),
  remove: (id) => api.delete(`/vehicles/${id}`),
  bulkImport: (vehicles, vendorId) => api.post("/vehicles/bulk-import", { vehicles, vendorId }),
};

export const vendorService = {
  list: (params) => api.get("/vendors", { params }),
  getOne: (id) => api.get(`/vendors/${id}`),
  stats: (id) => api.get(`/vendors/${id}/stats`),
  create: (data) => api.post("/vendors", data),
  update: (id, data) => api.patch(`/vendors/${id}`, data),
  suspend: (id, reason) => api.post(`/vendors/${id}/suspend`, { reason }),
  reinstate: (id) => api.post(`/vendors/${id}/reinstate`),
};

export const estimateService = {
  getForJob: (jobId) => api.get(`/estimates/${jobId}`),
  create: (data) => api.post("/estimates", data),
  update: (id, data) => api.patch(`/estimates/${id}`, data),
};

export const invoiceService = {
  list: (params) => api.get("/invoices", { params }),
  getOne: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post("/invoices", data),
  confirmPayment: (id, ref) => api.post(`/invoices/${id}/confirm-payment`, { paystackRef: ref }),
  downloadPDF: (id, hideCost) => api.get(`/invoices/${id}/pdf`, { params: { hideCost }, responseType: "blob" }),
};

export const analyticsService = {
  getDashboard: () => api.get("/analytics/dashboard"),
  getMonthlyRevenue: () => api.get("/analytics/monthly-revenue"),
  getTopVehicles: () => api.get("/analytics/top-vehicles"),
};

export const auditService = {
  list: (params) => api.get("/audit", { params }),
  verifyChain: () => api.get("/audit/verify-chain"),
  export: (format, hideCost) => api.get("/audit/export", { params: { format, hideCost }, responseType: "blob" }),
};

export const subscriptionService = {
  list: () => api.get("/subscriptions"),
  getForVendor: (vendorId) => api.get(`/subscriptions/${vendorId}`),
  initiate: (vendorId, plan) => api.post("/subscriptions/initiate", { vendorId, plan }),
  verify: (reference) => api.get(`/subscriptions/verify?reference=${reference}`),
  extend: (vendorId, days, plan) => api.post("/subscriptions/extend", { vendorId, days, plan }),
  toggleDemo: (vendorId, enabled) => api.post("/subscriptions/demo", { vendorId, enabled }),
  cancel: (id) => api.post(`/subscriptions/${id}/cancel`),
};

export const userService = {
  me: () => api.get("/users/me"),
  list: (params) => api.get("/users", { params }),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  suspend: (id) => api.post(`/users/${id}/suspend`),
  resendCredentials: (id) => api.post(`/users/${id}/resend-credentials`),
};
