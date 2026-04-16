// backward compatibility wrapper (optional but safe during migration)
import apiClient from './apiClient';

const api = {
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  patch: (url, data, config) => apiClient.patch(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};

export default api;
