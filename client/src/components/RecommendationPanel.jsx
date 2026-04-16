export default function RecommendationPanel({ items }) {
  if (!items || items.length === 0) {
    return <div className="p-4">No recommendations available</div>;
  }

  return (
    <div className="p-4 border rounded">
      <h2>Recommendations</h2>

      {items.map((r, i) => (
        <div key={i}>
          {r.title ?? r.message ?? "Recommendation"}
        </div>
      ))}
    </div>
  );
}
