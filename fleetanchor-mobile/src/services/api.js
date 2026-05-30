import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://anchor-fleetpro-production.up.railway.app/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Auto-attach token
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      try {
        const refresh = await AsyncStorage.getItem('refreshToken');
        if (!refresh) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: refresh });
        await AsyncStorage.setItem('accessToken', data.accessToken);
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
        err.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(err.config);
      } catch {
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
        // Navigate to login — handled by auth state
      }
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.post('/auth/me'),
};

export const inspectionAPI = {
  scanVehicle: (plateNumber, vin) => api.post('/inspections/scan', { plateNumber, vin }),
  captureOdometer: (sessionToken, odometer) => api.post('/inspections/odometer', { sessionToken, odometer }),
  submit: (data) => api.post('/inspections/submit', data),
  listForVehicle: (vehicleId) => api.get(`/inspections/vehicle/${vehicleId}`),
  currentTyres: (vehicleId) => api.get(`/inspections/vehicle/${vehicleId}/tyres`),
  summary: () => api.get('/inspections/summary'),
};

export const vehicleAPI = {
  list: () => api.get('/vehicles'),
  getOne: (id) => api.get(`/vehicles/${id}`),
  history: (id) => api.get(`/vehicles/${id}/history`),
};

export default api;
