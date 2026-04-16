import TopNav from "../components/TopNav";

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 py-4">
        {children}
      </div>
    </div>
  );
}
