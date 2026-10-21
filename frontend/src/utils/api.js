import axios from 'axios';

// Base API URL points to backend via Vite proxy or direct relative /api
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach JWT token
api.interceptors.request.use((config) => {
  // Check if simulated offline mode is on
  const isSimulatedOffline = localStorage.getItem('simulated_offline') === 'true';
  const isRealOffline = !navigator.onLine;

  if (isSimulatedOffline || isRealOffline) {
    // Block HTTP requests to verify offline execution
    return Promise.reject(new Error('Network Offline: Device has no connectivity to bank server.'));
  }

  const token = localStorage.getItem('offlinepay_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't auto-logout if we're offline
      const isSimulatedOffline = localStorage.getItem('simulated_offline') === 'true';
      if (!isSimulatedOffline && navigator.onLine) {
        localStorage.removeItem('offlinepay_token');
        localStorage.removeItem('offlinepay_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
