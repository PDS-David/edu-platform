import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

root.render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
