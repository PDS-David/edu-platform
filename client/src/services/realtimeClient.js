import { io } from "socket.io-client";

let socket = null;

export function initRealtime() {
  if (socket) return socket;

  socket = io(import.meta.env.VITE_API_URL, {
    withCredentials: true,
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("Realtime connected:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("Realtime disconnected");
  });

  return socket;
}

export function getSocket() {
  return socket;
}
