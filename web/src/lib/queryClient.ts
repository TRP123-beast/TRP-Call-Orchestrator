import { QueryClient } from '@tanstack/react-query';

// Sensible defaults; per-query staleTime/refetchInterval override these
// (10s dashboard, 3s active calls, 5s conversations).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
