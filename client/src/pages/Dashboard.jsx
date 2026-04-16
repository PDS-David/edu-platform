import useRecommendations from '../hooks/useRecommendations';

export default function Dashboard() {
  const { data, loading } = useRecommendations();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>

      <h2>Recommended</h2>
      {data?.recommended?.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}

      <h2>Weak Areas</h2>
      {data?.weak?.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
