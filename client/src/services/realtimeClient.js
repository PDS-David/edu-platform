/**
 * realtimeClient.js
 *
 * socket.io-client is loaded via dynamic import() so it is NEVER included
 * in the main entry bundle. A static `import { io } from 'socket.io-client'`
 * causes Vite/Rollup to pull the library into the initial chunk, where its
 * internal module-execution order runs before React initialises, producing:
 *   ReferenceError: React is not defined
 *
 * Dynamic import defers the load until initRealtime() is first called
 * (which only happens from useRealtimeSync, used only in DashboardHome,
 * which is an orphaned route not reachable from the main app navigation).
 * React is fully initialised by that point.
 *
 * Public API (identical to the old native-WebSocket version):
 *   initRealtime() — connect (idempotent, async)
 *   on(event, fn)  — subscribe
 *   off(event, fn) — unsubscribe
 *   emit(event, data) — send to server
 *   getSocket()    — raw Socket instance (may be null before initRealtime)
 */

let socket = null;
const listeners = new Map();

function getServerOrigin() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
      .replace(/^wss?:\/\//, 'https://')
      .replace(/^http:\/\//, 'http://');
  }
  return window.location.origin;
}

export async function initRealtime() {
  if (socket && socket.connected) return socket;

  // Dynamic import keeps socket.io-client OUT of the main entry chunk.
  const { io } = await import('socket.io-client');

  socket = io(getServerOrigin(), {
    withCredentials: true,
    transports: ['websocket', 'polling'],
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
    console.warn('[realtime] connection error:', err.message);
  });

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
