import {
  describeDue,
  formatDate,
  timeAgo,
  todayISO,
  type ActivityEntry,
  type Dashboard,
} from '@lumen/shared';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Plus, Smartphone, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Panel } from '@/components/PageHeader';
import { PriorityBadge } from '@/components/ui/Badges';
import { Beam } from '@/components/ui/Beam';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDocumentTitle, useSession } from '@/lib/hooks';
import { keys, LIVE_REFRESH_MS } from '@/lib/query';
import { ProjectFormDialog } from '../projects/ProjectFormDialog';
import { useProjects } from '../projects/queries';
import { useTaskActions, CompleteToggle } from '../tasks/TaskList';
import { TaskFormDialog } from '../tasks/TaskFormDialog';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The five required counters, read like an instrument display. */
function Readout({ data }: { data: Dashboard }) {
  const cells = [
    { label: 'Total projects', value: data.totalProjects, to: '/projects' },
    {
      label: 'Projects in progress',
      value: data.projectsInProgress,
      to: '/projects?status=IN_PROGRESS',
    },
    { label: 'Total tasks', value: data.totalTasks, to: '/tasks' },
    { label: 'Completed tasks', value: data.completedTasks, to: '/tasks?status=COMPLETED' },
    { label: 'Pending tasks', value: data.pendingTasks, to: '/tasks?status=PENDING' },
  ];
  return (
    <dl className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell, i) => (
        <Link
          key={cell.label}
          to={cell.to}
          className={cn(
            'group block px-5 lg:border-l lg:border-line',
            i === 0 && 'lg:border-l-0 lg:pl-0',
          )}
        >
          <dt className="text-[13px] text-ink-muted group-hover:text-ink">{cell.label}</dt>
          <dd className="tabular mt-1 text-[34px] leading-none font-semibold tracking-tight">
            {cell.value}
          </dd>
        </Link>
      ))}
    </dl>
  );
}

/** Task status distribution drawn as a spectrum: the dashboard's one signature element. */
function Spectrum({ data }: { data: Dashboard }) {
  const segments = [
    {
      key: 'COMPLETED',
      label: 'Completed',
      value: data.tasksByStatus.COMPLETED,
      className: 'bg-green',
    },
    {
      key: 'IN_PROGRESS',
      label: 'In progress',
      value: data.tasksByStatus.IN_PROGRESS,
      className: 'bg-blue',
    },
    {
      key: 'PENDING',
      label: 'Pending',
      value: data.tasksByStatus.PENDING,
      className: 'bg-slate/60',
    },
  ];
  const total = data.totalTasks;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-sm text-ink-muted">
          <span className="tabular text-[22px] font-semibold text-ink">{data.completionRate}%</span>{' '}
          of all tasks completed
        </p>
        <p className="hidden text-sm text-ink-muted sm:block">
          {data.overdueTasks > 0 ? (
            <Link to="/tasks?overdue=true" className="font-medium text-red hover:underline">
              {data.overdueTasks} overdue
            </Link>
          ) : (
            'Nothing overdue'
          )}
          <span className="mx-2 text-ink-faint">/</span>
          {data.dueThisWeek} due in the next 7 days
        </p>
      </div>
      <div
        className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full"
        role="img"
        aria-label={`Tasks by status: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}
      >
        {total === 0 ? (
          <div className="spectrum h-full w-full opacity-25" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.key}
                className={cn(
                  'beam-in h-full first:rounded-l-full last:rounded-r-full',
                  s.className,
                )}
                style={{ flexGrow: s.value }}
              />
            ))
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-muted">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', s.className)} aria-hidden />
            {s.label}
            <span className="tabular font-medium text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const Icon = entry.platform === 'mobile' ? Smartphone : Monitor;
  return (
    <li className="flex gap-3 py-2.5">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
          entry.platform === 'mobile' ? 'bg-violet-soft text-violet' : 'bg-sunken text-ink-muted',
        )}
        title={entry.platform === 'mobile' ? 'From the Android app' : 'From the web app'}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{entry.platform === 'mobile' ? 'Android app' : 'Web app'}</span>
      </span>
      <div className="min-w-0">
        <p className="text-[14px] leading-snug">{entry.summary}</p>
        <p className="mt-0.5 text-[12px] text-ink-faint">{timeAgo(entry.createdAt)}</p>
      </div>
    </li>
  );
}

function NeedsAttention({ data, onOpenTask }: { data: Dashboard; onOpenTask: () => void }) {
  const { setStatus, confirm } = useTaskActions(onOpenTask);
  if (data.upcomingTasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        No open tasks with a due date. Add due dates to see them here.
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {data.upcomingTasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 py-3">
            <CompleteToggle task={task} onToggle={() => setStatus(task, 'COMPLETED')} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{task.name}</p>
              <p className="truncate text-[12px] text-ink-muted">
                <Link to={`/projects/${task.projectId}`} className="hover:underline">
                  {task.projectName}
                </Link>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={cn(
                  'tabular text-[12px]',
                  task.isOverdue ? 'font-medium text-red' : 'text-ink-muted',
                )}
              >
                {describeDue(task.dueDate)}
              </span>
              <PriorityBadge priority={task.priority} compact />
            </div>
          </li>
        ))}
      </ul>
      {confirm}
    </>
  );
}

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useSession();
  const dashboard = useQuery({
    queryKey: keys.dashboard,
    queryFn: async () => (await api.dashboard.get()).data,
    refetchInterval: LIVE_REFRESH_MS,
  });
  const inProgress = useProjects({
    status: 'IN_PROGRESS',
    sort: 'updatedAt',
    order: 'desc',
    limit: 4,
  });
  const [projectOpen, setProjectOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">{formatDate(todayISO())}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setProjectOpen(true)} icon={<Plus className="size-4" />}>
            New project
          </Button>
          <Button
            variant="primary"
            onClick={() => setTaskOpen(true)}
            icon={<Plus className="size-4" />}
            disabled={dashboard.data?.totalProjects === 0}
          >
            New task
          </Button>
        </div>
      </div>

      {dashboard.isPending ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
      ) : dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : dashboard.data.totalProjects === 0 ? (
        <Panel>
          <EmptyState
            icon={<Sparkles className="size-7" />}
            title="Welcome to Lumen"
            action={
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => setProjectOpen(true)}
              >
                Create your first project
              </Button>
            }
          >
            Start with a project, then add the tasks that move it forward. Everything you add here
            also appears in the Android app.
          </EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-8">
          <Panel className="px-0 py-6 lg:px-6">
            <Readout data={dashboard.data} />
            <div className="mt-7 border-t border-line px-5 pt-6 lg:px-0">
              <Spectrum data={dashboard.data} />
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
            <Panel className="px-5 py-4">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Needs attention</h2>
                <Link
                  to="/tasks?sort=due"
                  className="text-[13px] font-medium text-violet hover:underline"
                >
                  All tasks
                </Link>
              </div>
              <NeedsAttention data={dashboard.data} onOpenTask={() => setTaskOpen(true)} />
            </Panel>

            <Panel className="px-5 py-4">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Recent activity</h2>
                <Link
                  to="/activity"
                  className="text-[13px] font-medium text-violet hover:underline"
                >
                  View all
                </Link>
              </div>
              {dashboard.data.recentActivity.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Changes from the web and the Android app appear here.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {dashboard.data.recentActivity.slice(0, 6).map((entry) => (
                    <ActivityItem key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {inProgress.data && inProgress.data.data.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Projects in progress</h2>
                <Link
                  to="/projects?status=IN_PROGRESS"
                  className="text-[13px] font-medium text-violet hover:underline"
                >
                  All projects
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {inProgress.data.data.map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="truncate text-[15px] font-semibold">{project.name}</h3>
                      <span className="tabular text-sm font-medium">
                        {project.taskStats.progress}%
                      </span>
                    </div>
                    <p className="mt-0.5 mb-3 text-[12px] text-ink-muted">
                      {project.taskStats.completed} of {project.taskStats.total} tasks
                      {project.endDate && <>, ends {formatDate(project.endDate)}</>}
                    </p>
                    <Beam stats={project.taskStats} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ProjectFormDialog open={projectOpen} onClose={() => setProjectOpen(false)} />
      <TaskFormDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
    </>
  );
}
