// client/src/pages/em/EMPractice.jsx
// Route: /em/practice (inside EMLayout + EMPrivateRoute)
//
// Receives an optional category from location.state.category when navigated
// to from EMDashboard (user clicked a category card → navigate('/em/practice',
// { state: { category } })). Passes it to EnglishMasterclass as initialCategory
// so the session starts immediately for that category.
//
// Task 5 (future): Extract PracticeSession/SessionSummary fully into this file.
// For now delegates to EnglishMasterclass in embedded mode (no standalone header).

import { useLocation } from 'react-router-dom';
import EnglishMasterclass from '../EnglishMasterclass';

export default function EMPractice() {
  const location = useLocation();
  // category is set when navigating from EMDashboard category card
  const preselectedCategory = location.state?.category ?? null;

  return (
    <EnglishMasterclass
      embedded
      initialCategory={preselectedCategory}
    />
  );
}
