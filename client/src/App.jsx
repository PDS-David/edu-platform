import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import QueryProvider from './providers/QueryProvider';

// realtime client (safe import)
import realtimeClient from './services/realtimeClient';
import { queryClient } from './providers/QueryProvider';

// optional: connect realtime once app loads
realtimeClient.connect((event, data) => {
  if (event === 'progress.updated') {
    queryClient.invalidateQueries(['progress']);
    queryClient.invalidateQueries(['analytics-summary']);
  }

  if (event === 'quiz.completed') {
    queryClient.invalidateQueries(['analytics-summary']);
    queryClient.invalidateQueries(['weak-topics']);
  }
});

function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </QueryProvider>
  );
}

export default App;
