// client/src/pages/em/EMProgress.jsx
// Route: /em/progress (inside EMLayout + EMPrivateRoute)
//
// Task 1: Provides a named page component so App.jsx can import it cleanly.
// Task 6: Will extract ProgressTab out of EnglishMasterclass directly into this
//         file and add: retry button on error state, "Browse levels" CTA in
//         empty state, and recharts AreaChart for accuracy trend.
//
// For now delegates to EnglishMasterclass in embedded mode, progress tab.

import EnglishMasterclass from '../EnglishMasterclass';

export default function EMProgress() {
  return <EnglishMasterclass embedded defaultTab="progress" />;
}
