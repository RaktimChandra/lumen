import type { CreateProjectInput, ProjectListParams, UpdateProjectInput } from '@lumen/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateWorkData, keys, LIVE_REFRESH_MS } from '@/lib/query';

export function useProjects(params: ProjectListParams) {
  return useQuery({
    queryKey: keys.projects(params),
    queryFn: ({ signal }) => api.projects.list(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: async () => (await api.projects.get(id)).data,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useCreateProject() {
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => (await api.projects.create(input)).data,
    onSuccess: () => invalidateWorkData(),
  });
}

export function useUpdateProject() {
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      (await api.projects.update(id, input)).data,
    onSuccess: () => invalidateWorkData(),
  });
}

export function useDeleteProject() {
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: () => invalidateWorkData(),
  });
}
