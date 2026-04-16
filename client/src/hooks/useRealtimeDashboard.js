import { useEffect } from "react";
import { io } from "socket.io-client";
import { queryClient } from "../providers/queryClient";

export default function useRealtimeDashboard() {
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL, {
      withCredentials: true,
    });

    socket.on("connect", () => {
      console.log("Realtime connected:", socket.id);
    });

    // invalidate cached dashboard queries on updates
    socket.on("progress.updated", () => {
      queryClient.invalidateQueries(["dashboard"]);
    });

    socket.on("quiz.completed", () => {
      queryClient.invalidateQueries(["dashboard"]);
    });

    socket.on("resource.viewed", () => {
      queryClient.invalidateQueries(["dashboard"]);
    });

    return () => socket.disconnect();
  }, []);
}
