export default function WeakTopicsPanel({ weakTopics }) {
  return (
    <div>
      <h2>Weak Areas</h2>

      {weakTopics.length === 0 && (
        <p>You're doing great.</p>
      )}

      {weakTopics.map((item) => (
        <div key={item.id}>
          {item.name}
        </div>
      ))}
    </div>
  );
}
