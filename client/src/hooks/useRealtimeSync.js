import { useEffect } from "react";
import { initRealtime, on, off } from "../services/realtimeClient";
import { queryClient } from "../providers/queryClient";

export default function useRealtimeSync() {
  useEffect(() => {
    const invalidateDashboard = () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    };

    const events = ["progress.updated", "quiz.completed", "resource.viewed"];

    // initRealtime is now async (dynamic import) — connect then subscribe.
    let cancelled = false;
    initRealtime().then(() => {
      if (cancelled) return;
      events.forEach((event) => on(event, invalidateDashboard));
    }).catch(() => {
      // Realtime is an enhancement — failure must never crash the app.
    });

    return () => {
      cancelled = true;
      events.forEach((event) => off(event, invalidateDashboard));
    };
  }, []);
}
