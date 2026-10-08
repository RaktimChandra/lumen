import type { Paginated, ProjectListParams, TaskListParams } from '@lumen/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

const PAGE_SIZE = 25;

function nextPage<T>(last: Paginated<T>) {
  return last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined;
}

/** Infinite scrolling over the API's page/limit pagination. */
export function useInfiniteTasks(params: TaskListParams) {
  return useInfiniteQuery({
    queryKey: ['tasks', 'infinite', params],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api.tasks.list({ ...params, page: pageParam, limit: PAGE_SIZE }, signal),
    getNextPageParam: nextPage,
  });
}

export function useInfiniteProjects(params: ProjectListParams) {
  return useInfiniteQuery({
    queryKey: ['projects', 'infinite', params],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api.projects.list({ ...params, page: pageParam, limit: PAGE_SIZE }, signal),
    getNextPageParam: nextPage,
  });
}
