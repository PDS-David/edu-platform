import React from 'react';
import { useSessions, useStartSession, useEndSession } from '../hooks/useSessions';

export default function SessionPanel() {
  const { data, isLoading } = useSessions();
  const startSession = useStartSession();
  const endSession = useEndSession();

  if (isLoading) {
    return <div>Loading sessions...</div>;
  }

  return (
    <div className="p-4 rounded-xl border">
      <h2 className="text-lg font-semibold">Learning Sessions</h2>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => startSession.mutate({ subtopic_id: 1 })}
          className="px-3 py-1 border rounded"
        >
          Start
        </button>

        <button
          onClick={() => endSession.mutate({ session_id: 1 })}
          className="px-3 py-1 border rounded"
        >
          End
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {data?.map((s, idx) => (
          <div key={idx} className="p-2 border rounded">
            Subtopic: {s.subtopic_id} <br />
            Duration: {s.duration_seconds || 0}s
          </div>
        ))}
      </div>
    </div>
  );
}
