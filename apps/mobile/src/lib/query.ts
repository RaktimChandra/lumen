import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ApiError } from '@lumen/shared';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

// Let React Query know when the device goes on/offline and when the app is foregrounded.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))),
);
AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Show saved data first; when offline, keep it instead of failing.
      networkMode: 'offlineFirst',
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 1;
      },
    },
    // Mutations fail fast offline so the user gets a clear message instead of a spinner.
    mutations: { networkMode: 'always', retry: false },
  },
});

/**
 * Task, project and dashboard data are cached on the device for offline viewing.
 * Tokens are never part of this cache; they live in SecureStore.
 */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'lumen-query-cache',
  throttleTime: 1000,
});

const PERSISTED_ROOTS = new Set(['dashboard', 'projects', 'project', 'tasks']);
export const persistOptions = {
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) =>
      query.state.status === 'success' && PERSISTED_ROOTS.has(String(query.queryKey[0])),
  },
};

export async function clearCachedData() {
  queryClient.clear();
  await persister.removeClient();
}

export const keys = {
  dashboard: ['dashboard'] as const,
  projects: (params?: object) => ['projects', params ?? {}] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (params?: object) => ['tasks', params ?? {}] as const,
};

export function invalidateWorkData() {
  return Promise.all(
    ['tasks', 'projects', 'project', 'dashboard'].map((root) =>
      queryClient.invalidateQueries({ queryKey: [root] }),
    ),
  );
}
