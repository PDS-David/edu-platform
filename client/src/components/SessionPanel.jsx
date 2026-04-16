export default function SessionPanel({ activeSession }) {
  return (
    <div>
      <h2>Current Session</h2>

      {!activeSession ? (
        <p>No active session</p>
      ) : (
        <div>
          <p>Subtopic ID: {activeSession.subtopic_id}</p>
          <p>Started: {activeSession.started_at}</p>
        </div>
      )}
    </div>
  );
}
