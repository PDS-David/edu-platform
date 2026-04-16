import { Outlet } from "react-router-dom";

// Layout shell — pages are self-contained and manage their own TopNav/container.
// This shell exists to group routes by role and can be progressively enhanced
// with shared chrome (sidebar, breadcrumbs, etc.) as pages are refactored.
export default function StudentLayout() {
  return <Outlet />;
}
