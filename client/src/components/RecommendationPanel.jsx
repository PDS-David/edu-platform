export default function RecommendationPanel({ recommendations }) {
  return (
    <div>
      <h2>Recommended Next Steps</h2>

      {recommendations.length === 0 && (
        <p>No recommendations yet.</p>
      )}

      {recommendations.map((item) => (
        <div key={item.id}>
          <strong>{item.name}</strong>
          <div>Priority: {item.priority_score}</div>
        </div>
      ))}
    </div>
  );
}
