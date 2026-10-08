import {
  formatDate,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from '@lumen/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { ApiError } from '@/api/client';
import { Screen } from '@/components/Screen';
import {
  Beam,
  ChipGroup,
  EmptyState,
  ErrorState,
  Loading,
  SearchBar,
  StatusChip,
  Text,
} from '@/components/ui';
import { useInfiniteProjects } from '@/features/useInfiniteList';
import { useDebounced } from '@/lib/useDebounced';
import { usePalette } from '@/theme';

const STATUS_OPTIONS = PROJECT_STATUSES.map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}));

function ProjectRow({ project }: { project: Project }) {
  const p = usePalette();
  const { taskStats: stats } = project;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${PROJECT_STATUS_LABELS[project.status]}, ${stats.progress}% complete`}
      style={({ pressed }) => ({
        backgroundColor: pressed ? p.sunken : p.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: p.line,
        padding: 16,
        gap: 10,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={2}>
          {project.name}
        </Text>
        <StatusChip status={project.status} />
      </View>
      {project.description ? (
        <Text variant="caption" tone="inkMuted" numberOfLines={2}>
          {project.description}
        </Text>
      ) : null}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="inkMuted">
            {stats.completed} of {stats.total} tasks
            {stats.overdue > 0 ? (
              <Text variant="caption" tone="red">{`  ${stats.overdue} overdue`}</Text>
            ) : null}
          </Text>
          <Text variant="caption" style={{ fontFamily: 'InstrumentSans_600SemiBold' }}>
            {stats.progress}%
          </Text>
        </View>
        <Beam stats={stats} />
      </View>
      {project.endDate && (
        <Text variant="caption" tone="inkFaint">
          Ends {formatDate(project.endDate)}
        </Text>
      )}
    </Pressable>
  );
}

export default function ProjectsScreen() {
  const p = usePalette();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const debounced = useDebounced(search.trim());
  const query = useInfiniteProjects({
    search: debounced || undefined,
    status: status ?? undefined,
    sort: 'updatedAt',
    order: 'desc',
  });
  const projects = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.meta.total;

  return (
    <Screen
      title="Projects"
      subtitle={
        total === undefined ? undefined : `${total} ${total === 1 ? 'project' : 'projects'}`
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search projects" />
        <ChipGroup
          label="Filter by status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />
      </View>
      {query.isPending ? (
        <Loading />
      ) : query.isError && projects.length === 0 ? (
        <ErrorState
          offline={query.error instanceof ApiError && query.error.isNetworkError}
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProjectRow project={item} />}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: 32 }}
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
            debounced || status ? (
              <EmptyState title="No projects match" message="Try a different name or status." />
            ) : (
              <EmptyState
                title="No projects yet"
                message="Create projects on the Lumen web app. They appear here right away."
              />
            )
          }
        />
      )}
    </Screen>
  );
}
