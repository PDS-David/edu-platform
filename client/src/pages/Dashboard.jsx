import ProgressSummary from "../../components/dashboard/ProgressSummary";
import WeakTopicsPanel from "../../components/dashboard/WeakTopicsPanel";
import RecommendationPanel from "../../components/dashboard/RecommendationPanel";
import SessionPanel from "../../components/dashboard/SessionPanel";

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <ProgressSummary data={null} />
      <WeakTopicsPanel items={[]} />
      <RecommendationPanel items={[]} />
      <SessionPanel sessions={[]} />
    </div>
  );
}
