// client/src/pages/em/EMPractice.jsx
// Route: /em/practice (inside EMLayout + EMPrivateRoute)
//
// Receives an optional category from location.state.category when navigated
// to from EMDashboard (user clicked a category card → navigate('/em/practice',
// { state: { category } })). Passes it to EnglishMasterclass as initialCategory
// so the session starts immediately for that category.

import { useLocation } from 'react-router-dom';
import EnglishMasterclass from '../EnglishMasterclass';

export default function EMPractice() {
  const location = useLocation();
  // category is set when navigating from EMDashboard category card
  const preselectedCategory = location.state?.category ?? null;

  return (
    <EnglishMasterclass initialCategory={preselectedCategory} />
  );
}
