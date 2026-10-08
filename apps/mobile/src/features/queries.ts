import type {
  CreateTaskInput,
  Paginated,
  ProjectListParams,
  Task,
  TaskListParams,
  UpdateTaskInput,
} from '@lumen/shared';
import { keepPreviousData, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query';
import { api } from '@/api/client';
import { invalidateWorkData, keys, queryClient } from '@/lib/query';

type TaskCache = Paginated<Task> | InfiniteData<Paginated<Task>>;

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: async () => (await api.dashboard.get()).data,
  });
}

export function useProjects(params: ProjectListParams) {
  return useQuery({
    queryKey: keys.projects(params),
    queryFn: ({ signal }) => api.projects.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: async () => (await api.projects.get(id)).data,
  });
}

export function useTasks(params: TaskListParams) {
  return useQuery({
    queryKey: keys.tasks(params),
    queryFn: ({ signal }) => api.tasks.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** Look up a task in any cached list first, so the edit screen opens instantly (and offline). */
export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: async () => (await api.tasks.get(id)).data,
    initialData: () => {
      for (const [, cached] of queryClient.getQueriesData<TaskCache>({ queryKey: ['tasks'] })) {
        if (!cached) continue;
        const pages = 'pages' in cached ? cached.pages : [cached];
        for (const page of pages) {
          const hit = page.data.find((task) => task.id === id);
          if (hit) return hit;
        }
      }
      return undefined;
    },
    initialDataUpdatedAt: 0,
  });
}

export function useCreateTask() {
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => (await api.tasks.create(input)).data,
    onSuccess: () => invalidateWorkData(),
  });
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      (await api.tasks.update(id, input)).data,
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const patch = (task: Task): Task =>
        task.id !== id
          ? task
          : {
              ...task,
              ...(input.status
                ? {
                    status: input.status,
                    isOverdue: input.status === 'COMPLETED' ? false : task.isOverdue,
                  }
                : {}),
              ...(input.priority ? { priority: input.priority } : {}),
            };
      // Task lists are cached both as single pages and as infinite (paged) lists.
      const snapshots = queryClient.getQueriesData<TaskCache>({ queryKey: ['tasks'] });
      for (const [key, cached] of snapshots) {
        if (!cached) continue;
        const next: TaskCache =
          'pages' in cached
            ? {
                ...cached,
                pages: cached.pages.map((page) => ({ ...page, data: page.data.map(patch) })),
              }
            : { ...cached, data: cached.data.map(patch) };
        queryClient.setQueryData(key, next);
      }
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      for (const [key, page] of context?.snapshots ?? []) queryClient.setQueryData(key, page);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['task'] });
      return invalidateWorkData();
    },
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => invalidateWorkData(),
  });
}
