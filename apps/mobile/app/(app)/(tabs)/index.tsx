import { formatDate, timeAgo, todayISO, type Dashboard } from '@lumen/shared';
import { router } from 'expo-router';
import { Monitor, Plus, Smartphone } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';
import { ApiError } from '@/api/client';
import { useSession } from '@/auth/useSession';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, ErrorState, Loading, Text } from '@/components/ui';
import { useDashboard } from '@/features/queries';
import { Separator, TaskRow } from '@/features/TaskRow';
import { usePalette } from '@/theme';

function Counters({ data }: { data: Dashboard }) {
  const p = usePalette();
  const cells = [
    { label: 'Total projects', value: data.totalProjects },
    { label: 'Projects in progress', value: data.projectsInProgress },
    { label: 'Total tasks', value: data.totalTasks },
    { label: 'Completed tasks', value: data.completedTasks },
    { label: 'Pending tasks', value: data.pendingTasks },
    { label: 'Overdue', value: data.overdueTasks, alert: data.overdueTasks > 0 },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {cells.map((cell, index) => (
        <View
          key={cell.label}
          accessible
          accessibilityLabel={`${cell.label}: ${cell.value}`}
          style={{
            width: '50%',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderTopWidth: index > 1 ? 1 : 0,
            borderLeftWidth: index % 2 === 1 ? 1 : 0,
            borderColor: p.line,
          }}
        >
          <Text variant="caption" tone="inkMuted">
            {cell.label}
          </Text>
          <Text variant="number" style={{ marginTop: 4, color: cell.alert ? p.red : p.ink }}>
            {cell.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatusSpectrum({ data }: { data: Dashboard }) {
  const p = usePalette();
  const segments = [
    { label: 'Completed', value: data.tasksByStatus.COMPLETED, color: p.green },
    { label: 'In progress', value: data.tasksByStatus.IN_PROGRESS, color: p.blue },
    { label: 'Pending', value: data.tasksByStatus.PENDING, color: p.slate },
  ];
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text tone="inkMuted">
        <Text variant="heading" style={{ fontSize: 20 }}>
          {data.completionRate}%
        </Text>{' '}
        of tasks completed
      </Text>
      <View
        accessible
        accessibilityLabel={segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}
        style={{
          flexDirection: 'row',
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          gap: 3,
          backgroundColor: p.sunken,
        }}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <View
              key={s.label}
              style={{
                flex: s.value,
                backgroundColor: s.color,
                opacity: s.label === 'Pending' ? 0.6 : 1,
              }}
            />
          ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text variant="caption" tone="inkMuted">
              {s.label}{' '}
              <Text variant="caption" style={{ fontFamily: 'InstrumentSans_600SemiBold' }}>
                {s.value}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const p = usePalette();
  const { user } = useSession();
  const dashboard = useDashboard();
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <Screen title={`Hi, ${firstName}`} subtitle={formatDate(todayISO())}>
      {dashboard.isPending ? (
        <Loading />
      ) : dashboard.isError && !dashboard.data ? (
        <ErrorState
          offline={dashboard.error instanceof ApiError && dashboard.error.isNetworkError}
          message={dashboard.error.message}
          onRetry={() => void dashboard.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={dashboard.isRefetching}
              onRefresh={() => void dashboard.refetch()}
              tintColor={p.violet}
              colors={[p.violet]}
            />
          }
        >
          {dashboard.data.totalProjects === 0 ? (
            <Card>
              <EmptyState
                title="Welcome to Lumen"
                message="Create your first project on the Projects tab or on the web. Everything stays in sync."
                action={
                  <Button
                    title="Go to projects"
                    variant="primary"
                    onPress={() => router.navigate('/projects')}
                    compact
                  />
                }
              />
            </Card>
          ) : (
            <>
              <Card>
                <Counters data={dashboard.data} />
                <View style={{ height: 1, backgroundColor: p.line }} />
                <StatusSpectrum data={dashboard.data} />
              </Card>

              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 16,
                    paddingBottom: 4,
                  }}
                >
                  <Text variant="heading">Needs attention</Text>
                  <Button
                    title="New task"
                    compact
                    variant="ghost"
                    icon={<Plus size={16} color={p.violet} />}
                    onPress={() => router.push('/task/new')}
                  />
                </View>
                {dashboard.data.upcomingTasks.length === 0 ? (
                  <Text variant="caption" tone="inkMuted" style={{ padding: 16 }}>
                    No open tasks with a due date.
                  </Text>
                ) : (
                  dashboard.data.upcomingTasks.map((task, i) => (
                    <View key={task.id}>
                      {i > 0 && <Separator />}
                      <TaskRow task={task} />
                    </View>
                  ))
                )}
              </Card>

              <Card style={{ paddingBottom: 6 }}>
                <Text variant="heading" style={{ padding: 16, paddingBottom: 6 }}>
                  Recent activity
                </Text>
                {dashboard.data.recentActivity.slice(0, 6).map((entry) => {
                  const Icon = entry.platform === 'mobile' ? Smartphone : Monitor;
                  return (
                    <View
                      key={entry.id}
                      style={{
                        flexDirection: 'row',
                        gap: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 9,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: entry.platform === 'mobile' ? p.violetSoft : p.sunken,
                        }}
                        accessibilityLabel={
                          entry.platform === 'mobile' ? 'From the Android app' : 'From the web app'
                        }
                      >
                        <Icon
                          size={14}
                          color={entry.platform === 'mobile' ? p.violet : p.inkMuted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14 }}>{entry.summary}</Text>
                        <Text variant="caption" tone="inkFaint">
                          {timeAgo(entry.createdAt)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
