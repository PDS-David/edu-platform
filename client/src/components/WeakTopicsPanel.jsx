export default function WeakTopicsPanel({ items }) {
  if (!items || items.length === 0) {
    return <div className="p-4">No weak topics detected</div>;
  }

  return (
    <div className="p-4 border rounded">
      <h2>Weak Topics</h2>

      {items.map((t, i) => (
        <div key={i}>
          {t.topic ?? "Unknown"} — {t.accuracy_pct ?? 0}%
        </div>
      ))}
    </div>
  );
}
