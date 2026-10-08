import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@lumen/shared';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Picks up changes made on the phone as soon as the tab is focused again.
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Light polling for screens people keep open, so phone edits appear without a reload. */
export const LIVE_REFRESH_MS = 15_000;

export const keys = {
  dashboard: ['dashboard'] as const,
  projects: (params?: object) => ['projects', params ?? {}] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (params?: object) => ['tasks', params ?? {}] as const,
  task: (id: string) => ['task', id] as const,
  activity: ['activity'] as const,
  sessions: ['sessions'] as const,
};

/** Everything a task or project change can affect. */
export function invalidateWorkData() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['task'] }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['project'] }),
    queryClient.invalidateQueries({ queryKey: keys.dashboard }),
    queryClient.invalidateQueries({ queryKey: keys.activity }),
  ]);
}
