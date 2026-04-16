export default function ProgressSummary({ sessionStats }) {
  return (
    <div>
      <h2>Study Overview</h2>

      <p>Total Sessions: {sessionStats?.total_sessions}</p>
      <p>Total Time: {sessionStats?.total_time} sec</p>
      <p>Average Session: {sessionStats?.avg_session_time} sec</p>
    </div>
  );
}
