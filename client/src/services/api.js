// client/src/services/api.js
import apiClient from "./apiClient";

/**
 * Unified API wrapper
 * prevents import mismatch across codebase
 */
const api = apiClient;

export default api;
