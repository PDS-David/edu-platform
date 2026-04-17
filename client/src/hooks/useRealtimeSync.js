import { useEffect } from "react";
import { initRealtime, on, off } from "../services/realtimeClient";
import { queryClient } from "../providers/queryClient";

export default function useRealtimeSync() {
  useEffect(() => {
    const socket = initRealtime();

    const invalidateDashboard = () => {
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
      on(event, invalidateDashboard);
    });

    return () => {
      events.forEach((event) => {
        off(event, invalidateDashboard);
      });
    };
  }, []);
}
