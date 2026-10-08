import {
  formatDate,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@lumen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ApiError } from '@/api/client';
import { OfflineBanner } from '@/components/OfflineBanner';
import {
  Beam,
  Button,
  ChipGroup,
  EmptyState,
  ErrorState,
  Loading,
  SearchBar,
  StatusChip,
  Text,
} from '@/components/ui';
import { useProject } from '@/features/queries';
import { Separator, TaskRow } from '@/features/TaskRow';
import { useInfiniteTasks } from '@/features/useInfiniteList';
import { useDebounced } from '@/lib/useDebounced';
import { usePalette } from '@/theme';

const STATUS_OPTIONS = TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABELS[value] }));
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const project = useProject(id);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const debounced = useDebounced(search.trim());
  const tasks = useInfiniteTasks({
    projectId: id,
    search: debounced || undefined,
    status: status ?? undefined,
    priority: priority ?? undefined,
    sort: 'dueDate',
    order: 'asc',
  });
  const list = tasks.data?.pages.flatMap((page) => page.data) ?? [];

  const refresh = () => {
    void project.refetch();
    void tasks.refetch();
  };

  if (project.isError && !project.data) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return notFound ? (
      <EmptyState
        title="Project not found"
        message="It may have been deleted on another device."
        action={<Button title="Back to projects" onPress={() => router.back()} />}
      />
    ) : (
      <ErrorState
        offline={project.error instanceof ApiError && project.error.isNetworkError}
        message={project.error.message}
        onRetry={refresh}
      />
    );
  }
  if (!project.data) return <Loading />;
  const data = project.data;

  const header = (
    <View style={{ gap: 14, paddingBottom: 12 }}>
      <View style={{ gap: 8 }}>
        <Text variant="title" accessibilityRole="header">
          {data.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <StatusChip status={data.status} />
          {(data.startDate || data.endDate) && (
            <Text variant="caption" tone="inkMuted">
              {data.startDate ? formatDate(data.startDate) : 'Open'} –{' '}
              {data.endDate ? formatDate(data.endDate) : 'open'}
            </Text>
          )}
        </View>
        {data.description ? <Text tone="inkMuted">{data.description}</Text> : null}
      </View>
      <View style={{ gap: 8 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <Text variant="caption" tone="inkMuted">
            {data.taskStats.completed} of {data.taskStats.total} tasks completed
          </Text>
          <Text variant="heading">{data.taskStats.progress}%</Text>
        </View>
        <Beam stats={data.taskStats} height={8} />
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search this project" />
      <ChipGroup
        label="Filter by status"
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />
      <ChipGroup
        label="Filter by priority"
        options={PRIORITY_OPTIONS}
        value={priority}
        onChange={setPriority}
      />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Button
              title="New task"
              compact
              variant="ghost"
              icon={<Plus size={16} color={p.violet} />}
              onPress={() => router.push({ pathname: '/task/new', params: { projectId: id } })}
            />
          ),
        }}
      />
      <OfflineBanner />
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <View
            style={{
              backgroundColor: p.surface,
              borderColor: p.line,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderTopWidth: index === 0 ? 1 : 0,
              borderBottomWidth: index === list.length - 1 ? 1 : 0,
              borderTopLeftRadius: index === 0 ? 14 : 0,
              borderTopRightRadius: index === 0 ? 14 : 0,
              borderBottomLeftRadius: index === list.length - 1 ? 14 : 0,
              borderBottomRightRadius: index === list.length - 1 ? 14 : 0,
              overflow: 'hidden',
            }}
          >
            {index > 0 && <Separator />}
            <TaskRow task={item} showProject={false} />
          </View>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={(project.isRefetching || tasks.isRefetching) && !tasks.isFetchingNextPage}
            onRefresh={refresh}
            tintColor={p.violet}
            colors={[p.violet]}
          />
        }
        onEndReached={() =>
          tasks.hasNextPage && !tasks.isFetchingNextPage && void tasks.fetchNextPage()
        }
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          tasks.isFetchingNextPage ? (
            <ActivityIndicator color={p.violet} style={{ margin: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          tasks.isPending ? (
            <Loading />
          ) : tasks.isError ? (
            <ErrorState
              offline={tasks.error instanceof ApiError && tasks.error.isNetworkError}
              message={tasks.error.message}
              onRetry={refresh}
            />
          ) : debounced || status || priority ? (
            <EmptyState title="No tasks match" message="Try another name, status or priority." />
          ) : (
            <EmptyState
              title="No tasks in this project"
              action={
                <Button
                  title="Add a task"
                  variant="primary"
                  compact
                  onPress={() => router.push({ pathname: '/task/new', params: { projectId: id } })}
                />
              }
            />
          )
        }
      />
    </View>
  );
}
