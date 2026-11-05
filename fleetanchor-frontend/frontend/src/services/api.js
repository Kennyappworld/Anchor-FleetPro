import axios from "axios";

// The web app always calls its own domain: vercel.json forwards /api to the API
// server (and vite.config.js does the same in development). That keeps the
// session cookie first-party. VITE_API_URL is honoured only in development.
const API_BASE = ((import.meta.env.DEV && import.meta.env.VITE_API_URL) || "/api").replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// ── Session tokens ──────────────────────────────────────────────────────────
// The short-lived access token lives only in memory. The refresh token is an
// httpOnly cookie the browser sends to /api/auth/refresh — page scripts can't
// read it, so a malicious script can't steal a long-lived session.
let accessToken = null;
let refreshing = null;
let legacyRefresh = null; // one-time hand-over from sessions saved before this change

export const tokens = {
  get: () => accessToken,
  set: (t) => { accessToken = t || null; },
  clear: () => { accessToken = null; },
  setLegacy: (t) => { legacyRefresh = t || null; },
};

const AUTH_KEY = "fleetanchor-auth";
const signedIn = () => {
  try { return !!JSON.parse(localStorage.getItem(AUTH_KEY) || "{}")?.state?.isAuthenticated; } catch { return false; }
};

// One refresh at a time, shared by every request that needs it.
export function refreshSession() {
  if (!refreshing) {
    const body = legacyRefresh ? { refreshToken: legacyRefresh } : {};
    refreshing = axios
      .post(`${API_BASE}/auth/refresh`, body, { withCredentials: true, timeout: 60000 })
      .then((res) => {
        legacyRefresh = null;
        const t = res.data.accessToken || res.data.data?.accessToken;
        if (!t) throw new Error("refresh failed");
        accessToken = t;
        return t;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

function endSession() {
  accessToken = null;
  try { localStorage.removeItem(AUTH_KEY); } catch {}
  if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
}

const isAuthCall = (url = "") => /\/auth\/(login|refresh|logout|forgot-password|verify-otp|reset-password)/.test(url);

api.interceptors.request.use(async (config) => {
  // After a page reload the access token is gone; get a new one first.
  if (!accessToken && signedIn() && !isAuthCall(config.url)) {
    try { await refreshSession(); } catch { /* the 401 handler below decides */ }
  }
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    if (error.response?.status === 401 && !original._retry && !isAuthCall(original.url)) {
      original._retry = true;
      try {
        const t = await refreshSession();
        original.headers.Authorization = `Bearer ${t}`;
        return api(original);
      } catch {
        endSession();
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const authService = {
  login: (data) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  refresh: () => api.post("/auth/refresh", {}),
  me: () => api.post("/auth/me"),
  // Password reset — OTP flow
  forgotPassword: (data) => api.post("/auth/forgot-password", data),
  verifyOtp: (data) => api.post("/auth/verify-otp", data),
  resetPassword: (data) => api.post("/auth/reset-password", data),
  // Password reset — Manager approval flow
  requestReset: (data) => api.post("/auth/request-reset", data),
  getPendingResets: () => api.get("/auth/pending-resets"),
  approveReset: (token, action, note) => api.post(`/auth/approve-reset/${encodeURIComponent(token)}`, { action, note }),
  // Manager issues credentials to a user
  issueCredentials: (data) => api.post("/auth/issue-credentials", data),
  // Vendor invite
  checkVendorInvite: (token) => api.get(`/auth/vendor-invite/${token}`),
  acceptVendorInvite: (data) => api.post("/auth/vendor-setup", data),
  changePassword: (currentPassword, newPassword) => api.post("/auth/change-password", { currentPassword, newPassword }),
};

export const jobService = {
  list: (params) => api.get("/jobs", { params }),
  getOne: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post("/jobs", data),
  updateStatus: (id, data) => api.patch(`/jobs/${id}/status`, data),
  // Fleet managers answer an estimate here (the status route is workshop-only, so these always failed with 403).
  approveEstimate: (id) => api.post(`/jobs/${id}/estimate-response`, { action: 'approve' }),
  queryEstimate: (id, note) => api.post(`/jobs/${id}/estimate-response`, { action: 'query', queryNote: note }),
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
  updateServiceSchedule: (id, data) => api.patch(`/vehicles/${id}/service-schedule`, data),
  updateOdometer: (id, km) => api.patch(`/vehicles/${id}/odometer`, { currentOdometer: km }),
};

export const vendorService = {
  list: (params) => api.get("/vendors", { params }),
  listDeleted: () => api.get("/vendors/deleted/list"),
  getOne: (id) => api.get(`/vendors/${id}`),
  stats: (id) => api.get(`/vendors/${id}/stats`),
  create: (data) => api.post("/vendors", data),
  update: (id, data) => api.patch(`/vendors/${id}`, data),
  suspend: (id, reason) => api.post(`/vendors/${id}/suspend`, { reason }),
  reinstate: (id) => api.post(`/vendors/${id}/reinstate`),
  remove: (id) => api.delete(`/vendors/${id}`),
  restore: (id) => api.post(`/vendors/${id}/restore`),
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
  getVendorDashboard: () => api.get("/analytics/vendor-dashboard"),
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

export const adminService = {
  backupStatus: () => api.get("/admin/backup/status"),
  runBackup: () => api.post("/admin/backup/run"),
  testEmail: (to) => api.post("/admin/test-email", { to }),
  sendMonthlyReports: () => api.post("/admin/reports/send-monthly"),
  getDemoVendors: () => api.get("/admin/demo/vendors"),
  resetDemoData: (vendorId) => api.post("/admin/demo/reset", { vendorId }),
};

export const platformService = {
  getSettings: () => api.get('/platform/settings'),
  updateSettings: (data) => api.patch('/platform/settings', data),
};

export const complianceService = {
  list: (params) => api.get('/compliance', { params }),
  summary: () => api.get('/compliance/summary'),
  add: (data) => api.post('/compliance', data),
  bulkImport: (rows) => api.post('/compliance/bulk-import', { rows }),
  update: (id, data) => api.patch(`/compliance/${id}`, data),
  remove: (id) => api.delete(`/compliance/${id}`),
};

export const driverLicenceService = {
  list: () => api.get('/driver-licences'),
  summary: () => api.get('/driver-licences/summary'),
  add: (data) => api.post('/driver-licences', data),
  bulkImport: (rows) => api.post('/driver-licences/bulk-import', { rows }),
  update: (id, data) => api.patch(`/driver-licences/${id}`, data),
  remove: (id) => api.delete(`/driver-licences/${id}`),
};

// Team chat (per fleet). Workshop users pass the fleet's vendorId.
export const chatService = {
  summary: (vendorId) => api.get("/chat/summary", { params: { vendorId } }),
  messages: (channel, vendorId, after) => api.get(`/chat/${channel}/messages`, { params: { vendorId, after } }),
  send: (channel, vendorId, body) => api.post(`/chat/${channel}/messages`, body, { params: { vendorId } }),
  remove: (id, vendorId) => api.delete(`/chat/messages/${id}`, { params: { vendorId } }),
};
