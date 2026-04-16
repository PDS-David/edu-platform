export default function SessionPanel({ sessions }) {
  if (!sessions || sessions.length === 0) {
    return <div className="p-4">No sessions yet</div>;
  }

  return (
    <div className="p-4 border rounded">
      <h2>Recent Sessions</h2>

      {sessions.map((s, i) => (
        <div key={i}>
          Subtopic: {s.subtopic_id ?? "N/A"} | Duration: {s.duration ?? 0}
        </div>
      ))}
    </div>
  );
}
