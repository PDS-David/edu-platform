let socket = null;
let listeners = new Map();

/**
 * Native WebSocket client (matches backend ws server)
 */
export function initRealtime() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return socket;
  }

  socket = new WebSocket(import.meta.env.VITE_WS_URL || "ws://localhost:5000");

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
