/**
 * realtimeClient.js
 * ─────────────────
 * X2 FIX: replaced native WebSocket with socket.io-client.
 *
 * The server uses socket.io (Server from 'socket.io'), which requires its own
 * handshake protocol — it is NOT compatible with a plain `new WebSocket(url)`.
 * socket.io-client is already in client/package.json (^4.8.3).
 *
 * API is intentionally identical to the old native-WS version so that
 * useRealtimeSync.js needs zero changes:
 *   initRealtime() — connect (idempotent)
 *   on(event, fn)  — subscribe
 *   off(event, fn) — unsubscribe
 *   emit(event, data) — send to server (optional)
 *   getSocket()    — raw socket.io Socket instance
 */

import { io } from 'socket.io-client';

let socket = null;
const listeners = new Map();

/**
 * Derive the server origin.  socket.io connects to the HTTP(S) origin, not a
 * ws:// URL — it upgrades the transport internally after the handshake.
 */
function getServerOrigin() {
  if (import.meta.env.VITE_WS_URL) {
    // VITE_WS_URL may be a ws:// URL from old config — convert to https://
    return import.meta.env.VITE_WS_URL
      .replace(/^wss?:\/\//, 'https://')
      .replace(/^http:\/\//, 'http://');
  }
  return window.location.origin; // e.g. https://www.aischoolonair.ng
}

export function initRealtime() {
  if (socket && socket.connected) return socket;

  socket = io(getServerOrigin(), {
    withCredentials: true,
    transports: ['websocket', 'polling'], // try WebSocket first, fall back to long-poll
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    // connected — no console output in production
  });

  socket.on('disconnect', (reason) => {
    // disconnected — no console output in production
  });

  socket.on('connect_error', (err) => {
    // Suppress noisy errors — realtime is an enhancement, not a hard requirement
    console.warn('[realtime] connection error:', err.message);
  });

  // Forward all incoming socket.io events to our listener map
  // so existing on()/off() callers work without any changes.
  socket.onAny((event, data) => {
    const handlers = listeners.get(event);
    if (handlers) handlers.forEach((fn) => fn(data));
  });

  return socket;
}

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
}

export function off(event, handler) {
  const handlers = listeners.get(event);
  if (handlers) handlers.delete(handler);
}

export function emit(event, data) {
  if (!socket || !socket.connected) return;
  socket.emit(event, data);
}

export function getSocket() {
  return socket;
}
