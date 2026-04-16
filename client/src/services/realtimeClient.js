import { io } from "socket.io-client";

let socket = null;

export function initRealtime() {
  if (socket) return socket;

  socket = io(import.meta.env.VITE_API_URL, {
    withCredentials: true,
    transports: ["websocket"],
    autoConnect: true,
  });

  socket.on("connect", () => {
    console.log("[realtime] connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[realtime] disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[realtime] connection error:", err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}
