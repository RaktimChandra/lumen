import { ApiError, LIMITS, type Task, type TaskPriority, type TaskStatus } from '@lumen/shared';
import { ArrowLeft, Columns3, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Panel } from '@/components/PageHeader';
import { ProjectStatusBadge } from '@/components/ui/Badges';
import { Beam } from '@/components/ui/Beam';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { Menu } from '@/components/ui/Menu';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from '@/components/ui/States';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRange } from '@/lib/dates';
import { useDebouncedValue, useDocumentTitle } from '@/lib/hooks';
import { useListParams } from '@/lib/params';
import { NotFoundPage } from '@/app/RouteError';
import { useCreateTask, useTasks } from '../tasks/queries';
import { TaskBoard } from '../tasks/TaskBoard';
import { TaskFormDialog } from '../tasks/TaskFormDialog';
import { TaskList } from '../tasks/TaskList';
import { OverdueToggle, PRIORITY_OPTIONS, STATUS_OPTIONS, TASK_SORTS } from '../tasks/TasksPage';
import { ProjectFormDialog } from './ProjectFormDialog';
import { useDeleteProject, useProject } from './queries';

function QuickAdd({ projectId }: { projectId: string }) {
  const [name, setName] = useState('');
  const create = useCreateTask();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { projectId, name: trimmed },
      {
        onSuccess: () => setName(''),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };
  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-3 border-b border-line px-4 py-2.5 sm:px-5"
    >
      <Plus className="size-[22px] shrink-0 p-0.5 text-ink-faint" aria-hidden />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add a task and press Enter"
        aria-label="New task name"
        maxLength={LIMITS.taskName.max}
        disabled={create.isPending}
        className="h-9 flex-1 bg-transparent text-[15px] placeholder:text-ink-faint focus:outline-none"
      />
      {name.trim() && (
        <Button type="submit" size="sm" variant="primary" loading={create.isPending}>
          Add
        </Button>
      )}
    </form>
  );
}

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProject(projectId);
  useDocumentTitle(project.data?.name ?? 'Project');

  const { values, page, set } = useListParams([
    'q',
    'status',
    'priority',
    'overdue',
    'sort',
    'view',
  ] as const);
  const view = values.view === 'board' ? 'board' : 'list';
  const [search, setSearch] = useState(values.q);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== values.q) set({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedSearch]);
  const sort = TASK_SORTS.find((s) => s.value === values.sort) ?? TASK_SORTS[0]!;

  const tasks = useTasks(
    {
      projectId,
      search: values.q || undefined,
      status: view === 'list' ? (values.status as TaskStatus) || undefined : undefined,
      priority: (values.priority as TaskPriority) || undefined,
      overdue: values.overdue === 'true' ? true : undefined,
      sort: view === 'board' ? 'priority' : sort.sort,
      order: view === 'board' ? 'desc' : sort.order,
      page: view === 'board' ? 1 : page,
      limit: view === 'board' ? 100 : 25,
    },
    { enabled: project.isSuccess },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    task: Task | null;
    status?: TaskStatus;
  }>({ open: false, task: null });
  const remove = useDeleteProject();

  if (project.isError) {
    if (
      project.error instanceof ApiError &&
      (project.error.status === 404 || project.error.status === 400)
    )
      return <NotFoundPage />;
    return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  }

  const p = project.data;
  const filtered = Boolean(values.q || values.status || values.priority || values.overdue);

  return (
    <>
      <Link
        to="/projects"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Projects
      </Link>

      {!p ? (
        <div className="mb-8 flex flex-col gap-3">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="mt-3 h-2 w-full max-w-md" />
        </div>
      ) : (
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[26px] leading-tight font-semibold tracking-tight break-words">
                  {p.name}
                </h1>
                <ProjectStatusBadge status={p.status} />
              </div>
              {p.description && (
                <p className="mt-2 max-w-2xl text-[15px] whitespace-pre-line text-ink-muted">
                  {p.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                icon={<Pencil className="size-3.5" />}
                onClick={() => setEditOpen(true)}
                className="hidden sm:inline-flex"
              >
                Edit
              </Button>
              <Menu
                label="Project actions"
                items={[
                  {
                    label: 'Edit project',
                    icon: <Pencil className="size-4" />,
                    onSelect: () => setEditOpen(true),
                  },
                  {
                    label: 'Delete project',
                    icon: <Trash2 className="size-4" />,
                    danger: true,
                    onSelect: () => setConfirmDelete(true),
                  },
                ]}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,420px)_auto] sm:items-end">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-ink-muted">
                  <span className="tabular font-semibold text-ink">{p.taskStats.completed}</span> of{' '}
                  <span className="tabular">{p.taskStats.total}</span> tasks completed
                </span>
                <span className="tabular text-xl font-semibold">{p.taskStats.progress}%</span>
              </div>
              <Beam stats={p.taskStats} className="h-2" animate />
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-ink-faint">Timeline</dt>
                <dd className="font-medium">{formatRange(p.startDate, p.endDate)}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">In progress</dt>
                <dd className="tabular font-medium">{p.taskStats.inProgress}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Overdue</dt>
                <dd className={cn('tabular font-medium', p.taskStats.overdue > 0 && 'text-red')}>
                  {p.taskStats.overdue}
                </dd>
              </div>
            </dl>
          </div>
        </header>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search this project"
          label="Search tasks in this project"
          className="w-full sm:w-60"
        />
        {view === 'list' && (
          <FilterSelect
            label="Filter by status"
            value={values.status as TaskStatus | ''}
            onChange={(status) => set({ status })}
            options={STATUS_OPTIONS}
            allLabel="All statuses"
          />
        )}
        <FilterSelect
          label="Filter by priority"
          value={values.priority as TaskPriority | ''}
          onChange={(priority) => set({ priority })}
          options={PRIORITY_OPTIONS}
          allLabel="All priorities"
        />
        <OverdueToggle
          pressed={values.overdue === 'true'}
          onChange={(on) => set({ overdue: on ? 'true' : null })}
        />
        {view === 'list' && (
          <FilterSelect
            label="Sort tasks"
            value={sort.value}
            onChange={(value) => set({ sort: value === 'recent' ? null : value })}
            options={TASK_SORTS.slice(1)}
            allLabel={TASK_SORTS[0]!.label}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <div
            role="group"
            aria-label="View"
            className="flex rounded-[var(--radius-control)] border border-line-strong bg-surface p-0.5"
          >
            {(['list', 'board'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => set({ view: mode === 'list' ? null : 'board' })}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium',
                  view === mode ? 'bg-sunken text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {mode === 'list' ? (
                  <List className="size-4" aria-hidden />
                ) : (
                  <Columns3 className="size-4" aria-hidden />
                )}
                {mode === 'list' ? 'List' : 'Board'}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setTaskDialog({ open: true, task: null })}
          >
            New task
          </Button>
        </div>
      </div>

      {view === 'board' ? (
        tasks.isPending ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-[var(--radius-panel)]" />
            ))}
          </div>
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : (
          <TaskBoard
            tasks={tasks.data.data}
            onEdit={(task) => setTaskDialog({ open: true, task })}
            onAdd={(status) => setTaskDialog({ open: true, task: null, status })}
          />
        )
      ) : (
        <Panel>
          {!filtered && <QuickAdd projectId={projectId} />}
          {tasks.isPending ? (
            <ListSkeleton rows={5} />
          ) : tasks.isError ? (
            <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
          ) : tasks.data.data.length === 0 ? (
            filtered ? (
              <EmptyState
                title="No tasks match these filters"
                action={
                  <Button
                    onClick={() => {
                      setSearch('');
                      set({ q: null, status: null, priority: null, overdue: null });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState title="No tasks in this project yet">
                Type a task above and press Enter, or use New task for more detail.
              </EmptyState>
            )
          ) : (
            <>
              <TaskList
                tasks={tasks.data.data}
                onEdit={(task) => setTaskDialog({ open: true, task })}
              />
              <Pagination meta={tasks.data.meta} onPage={(next) => set({ page: next })} />
            </>
          )}
        </Panel>
      )}

      {p && <ProjectFormDialog open={editOpen} onClose={() => setEditOpen(false)} project={p} />}
      <TaskFormDialog
        open={taskDialog.open}
        task={taskDialog.task}
        projectId={projectId}
        defaultStatus={taskDialog.status}
        onClose={() => setTaskDialog({ open: false, task: null })}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this project?"
        description={
          p && (
            <>
              “{p.name}” and its {p.taskStats.total} {p.taskStats.total === 1 ? 'task' : 'tasks'}{' '}
              will be deleted on web and mobile. This can’t be undone.
            </>
          )
        }
        confirmLabel="Delete project"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(projectId, {
            onSuccess: () => {
              toast.success('Project deleted');
              navigate('/projects', { replace: true });
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </>
  );
}
