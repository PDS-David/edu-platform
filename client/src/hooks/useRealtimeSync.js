import { useEffect } from "react";
import { initRealtime } from "../services/realtimeClient";
import { queryClient } from "../providers/queryClient";

export default function useRealtimeSync() {
  useEffect(() => {
    const socket = initRealtime();

    // 🎯 CORE EVENTS → invalidate cache only (NO UI changes)
    const eventsToInvalidate = [
      "progress.updated",
      "quiz.completed",
      "resource.viewed",
    ];

    eventsToInvalidate.forEach((event) => {
      socket.on(event, () => {
        // invalidate ALL dashboard-related queries
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
