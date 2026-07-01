// client/src/pages/em/EMPractice.jsx
// Route: /em/practice (inside EMLayout + EMPrivateRoute)
//
// Task 1: Provides a named page component so App.jsx can import it cleanly.
// Task 5: Will pull PracticeSession, SessionSummary out of EnglishMasterclass
//         directly into this file and handle location.state for pre-selected
//         categories (navigate here with { state: { category } } from dashboard).
//
// For now delegates to EnglishMasterclass in embedded mode (no standalone header).

import EnglishMasterclass from '../EnglishMasterclass';

export default function EMPractice() {
  return <EnglishMasterclass embedded />;
}
