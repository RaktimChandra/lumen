import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type SortOrder,
  type Task,
  type TaskPriority,
  type TaskSortField,
  type TaskStatus,
} from '@lumen/shared';
import { AlertCircle, ListPlus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { useDebouncedValue, useDocumentTitle } from '@/lib/hooks';
import { useListParams } from '@/lib/params';
import { useProjects } from '../projects/queries';
import { useTasks } from './queries';
import { TaskFormDialog } from './TaskFormDialog';
import { TaskList } from './TaskList';

export const TASK_SORTS: { value: string; label: string; sort: TaskSortField; order: SortOrder }[] =
  [
    { value: 'recent', label: 'Newest first', sort: 'createdAt', order: 'desc' },
    { value: 'due', label: 'Due date, soonest', sort: 'dueDate', order: 'asc' },
    { value: 'priority', label: 'Priority, highest', sort: 'priority', order: 'desc' },
    { value: 'name', label: 'Name A–Z', sort: 'name', order: 'asc' },
    { value: 'updated', label: 'Recently updated', sort: 'updatedAt', order: 'desc' },
  ];

export const STATUS_OPTIONS = TASK_STATUSES.map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));
export const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));

export function OverdueToggle({
  pressed,
  onChange,
}: {
  pressed: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors',
        pressed
          ? 'border-red/40 bg-red-soft text-red'
          : 'border-line-strong bg-surface text-ink-muted hover:text-ink',
      )}
    >
      <AlertCircle className="size-4" aria-hidden />
      Overdue
    </button>
  );
}

export function TasksPage() {
  useDocumentTitle('Tasks');
  const { values, page, set } = useListParams([
    'q',
    'status',
    'priority',
    'project',
    'overdue',
    'sort',
  ] as const);
  const [search, setSearch] = useState(values.q);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== values.q) set({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedSearch]);

  const sort = TASK_SORTS.find((s) => s.value === values.sort) ?? TASK_SORTS[0]!;
  const projects = useProjects({ limit: 100, sort: 'name', order: 'asc' });
  const query = useTasks({
    search: values.q || undefined,
    status: (values.status as TaskStatus) || undefined,
    priority: (values.priority as TaskPriority) || undefined,
    projectId: values.project || undefined,
    overdue: values.overdue === 'true' ? true : undefined,
    sort: sort.sort,
    order: sort.order,
    page,
    limit: 20,
  });

  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });
  const filtered = Boolean(
    values.q || values.status || values.priority || values.project || values.overdue,
  );
  const total = query.data?.meta.total;
  const hasProjects = (projects.data?.meta.total ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Tasks"
        description={
          total === undefined
            ? ' '
            : `${total} ${total === 1 ? 'task' : 'tasks'}${filtered ? ' match' : ' across all projects'}`
        }
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setDialog({ open: true, task: null })}
            disabled={!hasProjects && !projects.isPending}
          >
            New task
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tasks"
          label="Search tasks by name"
          className="w-full sm:w-64"
        />
        <FilterSelect
          label="Filter by status"
          value={values.status as TaskStatus | ''}
          onChange={(status) => set({ status })}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <FilterSelect
          label="Filter by priority"
          value={values.priority as TaskPriority | ''}
          onChange={(priority) => set({ priority })}
          options={PRIORITY_OPTIONS}
          allLabel="All priorities"
        />
        <FilterSelect
          label="Filter by project"
          value={values.project}
          onChange={(project) => set({ project })}
          options={(projects.data?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
          allLabel="All projects"
        />
        <OverdueToggle
          pressed={values.overdue === 'true'}
          onChange={(on) => set({ overdue: on ? 'true' : null })}
        />
        <FilterSelect
          label="Sort tasks"
          value={sort.value}
          onChange={(value) => set({ sort: value === 'recent' ? null : value })}
          options={TASK_SORTS.slice(1)}
          allLabel={TASK_SORTS[0]!.label}
        />
      </div>

      <Panel>
        {query.isPending ? (
          <ListSkeleton rows={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No tasks match these filters"
              action={
                <Button
                  onClick={() => {
                    setSearch('');
                    set({ q: null, status: null, priority: null, project: null, overdue: null });
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              Try another name, or widen the status and priority filters.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<ListPlus className="size-7" />}
              title={hasProjects ? 'No tasks yet' : 'Create a project first'}
              action={
                hasProjects ? (
                  <Button
                    variant="primary"
                    icon={<Plus className="size-4" />}
                    onClick={() => setDialog({ open: true, task: null })}
                  >
                    New task
                  </Button>
                ) : undefined
              }
            >
              {hasProjects
                ? 'Tasks you add to any project show up here.'
                : 'Every task belongs to a project. Add one from the Projects page.'}
            </EmptyState>
          )
        ) : (
          <>
            <TaskList
              tasks={query.data.data}
              showProject
              onEdit={(task) => setDialog({ open: true, task })}
            />
            <Pagination meta={query.data.meta} onPage={(p) => set({ page: p })} />
          </>
        )}
      </Panel>

      <TaskFormDialog
        open={dialog.open}
        task={dialog.task}
        projectId={values.project || undefined}
        onClose={() => setDialog({ open: false, task: null })}
      />
    </>
  );
}
