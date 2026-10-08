import type {
  CreateTaskInput,
  Paginated,
  Task,
  TaskListParams,
  UpdateTaskInput,
} from '@lumen/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateWorkData, keys, LIVE_REFRESH_MS, queryClient } from '@/lib/query';

export function useTasks(params: TaskListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.tasks(params),
    queryFn: ({ signal }) => api.tasks.list(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
    enabled: options.enabled ?? true,
  });
}

export function useCreateTask() {
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => (await api.tasks.create(input)).data,
    onSuccess: () => invalidateWorkData(),
  });
}

/**
 * Optimistic: the change shows instantly in every cached task list, and is rolled
 * back if the server rejects it.
 */
export function useUpdateTask() {
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      (await api.tasks.update(id, input)).data,
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const snapshots = queryClient.getQueriesData<Paginated<Task>>({ queryKey: ['tasks'] });
      const patch: Partial<Task> = {};
      if (input.status) {
        patch.status = input.status;
        patch.completedAt = input.status === 'COMPLETED' ? new Date().toISOString() : null;
        if (input.status === 'COMPLETED') patch.isOverdue = false;
      }
      if (input.priority) patch.priority = input.priority;
      if (input.name) patch.name = input.name;
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData<Paginated<Task>>(key, {
          ...data,
          data: data.data.map((task) => (task.id === id ? { ...task, ...patch } : task)),
        });
      }
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => invalidateWorkData(),
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => invalidateWorkData(),
  });
}
