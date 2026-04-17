import api from '../api';

/**
 * Central admin HTTP client
 * - Normalizes response
 * - Throws consistent errors
 */
export const adminClient = {
  async get(url, params = {}) {
    const res = await api.get(url, { params });
    return res.data;
  },

  async post(url, body = {}) {
    const res = await api.post(url, body);
    return res.data;
  },

  async put(url, body = {}) {
    const res = await api.put(url, body);
    return res.data;
  },

  async patch(url, body = {}) {
    const res = await api.patch(url, body);
    return res.data;
  },

  async delete(url) {
    const res = await api.delete(url);
    return res.data;
  }
};
