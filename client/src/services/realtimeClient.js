let socket = null;
let listeners = new Map();

/**
 * Native WebSocket client (matches backend ws server)
 */
export function initRealtime() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return socket;
  }

  // Derive WebSocket URL from the current page origin (works behind Caddy)
  const wsUrl = import.meta.env.VITE_WS_URL ||
    (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("[realtime] connected");
  };

  socket.onclose = () => {
    console.log("[realtime] disconnected");
  };

  socket.onerror = (err) => {
    console.warn("[realtime] error", err);
  };

  socket.onmessage = (message) => {
    try {
      const { event, data } = JSON.parse(message.data);

      const handlers = listeners.get(event);
      if (handlers) {
        handlers.forEach((fn) => fn(data));
      }
    } catch (e) {
      console.warn("[realtime] invalid message", message.data);
    }
  };

  return socket;
}

/**
 * Subscribe to event
 */
export function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }

  listeners.get(event).add(handler);
}

/**
 * Unsubscribe
 */
export function off(event, handler) {
  const handlers = listeners.get(event);
  if (handlers) {
    handlers.delete(handler);
  }
}

/**
 * Emit event (optional client → server usage)
 */
export function emit(event, data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({ event, data }));
}

export function getSocket() {
  return socket;
}
