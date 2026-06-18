// DEF-016: StudentLayout now wraps its outlet in a React Error Boundary.
// Previously it was a single-line <Outlet /> with no error handling —
// any unhandled exception in a child route crashed the entire student area.

import React from "react";
import { Outlet } from "react-router-dom";

class StudentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[StudentLayout] Unhandled error in student route:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f9f7f4] flex items-center justify-center p-8">
          <div className="bg-white border border-red-100 rounded-2xl p-8 max-w-md w-full shadow text-center">
            <p className="text-2xl mb-2">⚠️</p>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 mb-4">
              An unexpected error occurred in this page. Your data is safe.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function StudentLayout() {
  return (
    <StudentErrorBoundary>
      <Outlet />
    </StudentErrorBoundary>
  );
}
