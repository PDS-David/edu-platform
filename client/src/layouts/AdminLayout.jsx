import { Outlet } from "react-router-dom";
import TopNav from "../components/TopNav";

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="max-w-5xl mx-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}
