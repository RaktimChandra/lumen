import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskPriority,
  type TaskSortField,
  type TaskStatus,
} from '@lumen/shared';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ApiError } from '@/api/client';
import { Screen } from '@/components/Screen';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorState,
  Loading,
  SearchBar,
  Text,
} from '@/components/ui';
import { Separator, TaskRow } from '@/features/TaskRow';
import { useInfiniteTasks } from '@/features/useInfiniteList';
import { useDebounced } from '@/lib/useDebounced';
import { usePalette } from '@/theme';

const STATUS_OPTIONS = TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABELS[value] }));
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));
const SORT_OPTIONS: { value: TaskSortField; label: string; order: 'asc' | 'desc' }[] = [
  { value: 'createdAt', label: 'Newest', order: 'desc' },
  { value: 'dueDate', label: 'Due soonest', order: 'asc' },
  { value: 'priority', label: 'Highest priority', order: 'desc' },
];

export default function TasksScreen() {
  const p = usePalette();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [sort, setSort] = useState<TaskSortField>('createdAt');
  const debounced = useDebounced(search.trim());
  const order = SORT_OPTIONS.find((o) => o.value === sort)?.order ?? 'desc';

  const query = useInfiniteTasks({
    search: debounced || undefined,
    status: status ?? undefined,
    priority: priority ?? undefined,
    sort,
    order,
  });
  const tasks = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.meta.total;
  const filtered = Boolean(debounced || status || priority);

  return (
    <Screen
      title="Tasks"
      subtitle={
        total === undefined
          ? undefined
          : `${total} ${total === 1 ? 'task' : 'tasks'}${filtered ? ' match' : ''}`
      }
      actions={
        <Button
          title="New"
          variant="primary"
          compact
          icon={<Plus size={16} color={p.onAccent} />}
          onPress={() => router.push('/task/new')}
        />
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search tasks" />
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="caption" tone="inkMuted">
            Sort
          </Text>
          <ChipGroup
            label="Sort tasks"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(value) => setSort(value ?? 'createdAt')}
          />
        </View>
      </View>
      {query.isPending ? (
        <Loading />
      ) : query.isError && tasks.length === 0 ? (
        <ErrorState
          offline={query.error instanceof ApiError && query.error.isNetworkError}
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <View
              style={{
                backgroundColor: p.surface,
                borderColor: p.line,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderTopWidth: index === 0 ? 1 : 0,
                borderBottomWidth: index === tasks.length - 1 ? 1 : 0,
                borderTopLeftRadius: index === 0 ? 14 : 0,
                borderTopRightRadius: index === 0 ? 14 : 0,
                borderBottomLeftRadius: index === tasks.length - 1 ? 14 : 0,
                borderBottomRightRadius: index === tasks.length - 1 ? 14 : 0,
                overflow: 'hidden',
              }}
            >
              {index > 0 && <Separator />}
              <TaskRow task={item} />
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor={p.violet}
              colors={[p.violet]}
            />
          }
          onEndReached={() =>
            query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()
          }
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator color={p.violet} style={{ margin: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <Card>
              {filtered ? (
                <EmptyState
                  title="No tasks match"
                  message="Try another name, status or priority."
                />
              ) : (
                <EmptyState
                  title="No tasks yet"
                  message="Tap New to add a task to one of your projects."
                />
              )}
            </Card>
          }
        />
      )}
    </Screen>
  );
}
