import TopNav from "../components/TopNav";

export default function TeacherLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      {children}
    </div>
  );
}
