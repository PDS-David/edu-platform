import { useEffect, useState } from 'react';
import useAuth from '../hooks/useAuth';
import {
  getDashboardData,
  getSessionStats,
  getActiveSession,
} from '../api/dashboardApi';

import RecommendationPanel from '../components/dashboard/RecommendationPanel';
import WeakTopicsPanel from '../components/dashboard/WeakTopicsPanel';
import SessionPanel from '../components/dashboard/SessionPanel';
import ProgressSummary from '../components/dashboard/ProgressSummary';

export default function Dashboard() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [sessionStats, setSessionStats] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const [dash, stats, active] = await Promise.all([
          getDashboardData(),
          getSessionStats(),
          getActiveSession(),
        ]);

        setData(dash.data);
        setSessionStats(stats.data);
        setActiveSession(active.data);
      } catch (err) {
        console.error('Dashboard load failed:', err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  if (loading) return <div>Loading dashboard...</div>;
  if (!user) return <div>Please login</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Welcome back, {user.first_name || 'Student'}</h1>

      <ProgressSummary sessionStats={sessionStats} />

      <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
        <SessionPanel activeSession={activeSession} />

        <RecommendationPanel
          recommendations={data?.recommended || []}
        />

        <WeakTopicsPanel weakTopics={data?.weak || []} />
      </div>
    </div>
  );
}
