import { useEffect } from "react";
import { initRealtime } from "../services/realtimeClient";
import { queryClient } from "../providers/queryClient";

/**
 * Single source of truth for realtime dashboard sync
 * - One socket connection only
 * - Standardized cache invalidation
 */
export default function useRealtimeSync() {
  useEffect(() => {
    const socket = initRealtime();

    if (!socket) return;

    const handleInvalidate = () => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard"],
      });
    };

    const events = [
      "progress.updated",
      "quiz.completed",
      "resource.viewed",
    ];

    events.forEach((event) => {
      socket.on(event, handleInvalidate);
    });

    return () => {
      events.forEach((event) => {
        socket.off(event, handleInvalidate);
      });

      // IMPORTANT:
      // Do NOT disconnect here if socket is shared globally
      // (prevents breaking other components)
    };
  }, []);
}
