export default function ProgressSummary({ data }) {
  if (!data) {
    return <div className="p-4">No progress data available</div>;
  }

  return (
    <div className="p-4 border rounded">
      <h2>Progress Summary</h2>

      <div>Total Attempts: {data.total_attempts ?? 0}</div>
      <div>Accuracy: {data.accuracy_pct ?? 0}%</div>
      <div>XP Points: {data.xp_points ?? 0}</div>
    </div>
  );
}
