import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type Project,
  type ProjectSortField,
  type ProjectStatus,
  type SortOrder,
} from '@lumen/shared';
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/PageHeader';
import { ProjectStatusBadge } from '@/components/ui/Badges';
import { Beam } from '@/components/ui/Beam';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { Menu } from '@/components/ui/Menu';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/States';
import { errorMessage } from '@/lib/api';
import { formatRange } from '@/lib/dates';
import { useDebouncedValue, useDocumentTitle } from '@/lib/hooks';
import { useListParams } from '@/lib/params';
import { ProjectFormDialog } from './ProjectFormDialog';
import { useDeleteProject, useProjects } from './queries';

const SORTS: { value: string; label: string; sort: ProjectSortField; order: SortOrder }[] = [
  { value: 'recent', label: 'Newest first', sort: 'createdAt', order: 'desc' },
  { value: 'updated', label: 'Recently updated', sort: 'updatedAt', order: 'desc' },
  { value: 'name', label: 'Name A–Z', sort: 'name', order: 'asc' },
  { value: 'end', label: 'End date, soonest', sort: 'endDate', order: 'asc' },
];

const STATUS_OPTIONS = PROJECT_STATUSES.map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}));

export function ProjectsPage() {
  useDocumentTitle('Projects');
  const { values, page, set } = useListParams(['q', 'status', 'sort'] as const);
  const [search, setSearch] = useState(values.q);
  const debouncedSearch = useDebouncedValue(search);
  const sort = SORTS.find((s) => s.value === values.sort) ?? SORTS[0]!;

  useEffect(() => {
    if (debouncedSearch !== values.q) set({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedSearch]);

  const query = useProjects({
    search: values.q || undefined,
    status: (values.status as ProjectStatus) || undefined,
    sort: sort.sort,
    order: sort.order,
    page,
    limit: 12,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const remove = useDeleteProject();

  const filtered = Boolean(values.q || values.status);
  const total = query.data?.meta.total;

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          total === undefined
            ? ' '
            : `${total} ${total === 1 ? 'project' : 'projects'}${filtered ? ' match' : ''}`
        }
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New project
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search projects"
          label="Search projects by name"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Filter by status"
          value={values.status as ProjectStatus | ''}
          onChange={(status) => set({ status })}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <FilterSelect
          label="Sort projects"
          value={sort.value}
          onChange={(value) => set({ sort: value === 'recent' ? null : value })}
          options={SORTS.slice(1)}
          allLabel={SORTS[0]!.label}
        />
      </div>

      <Panel>
        {query.isPending ? (
          <ListSkeleton rows={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No projects match these filters"
              action={
                <Button
                  onClick={() => {
                    setSearch('');
                    set({ q: null, status: null });
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              Try a different name or status.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<FolderPlus className="size-7" />}
              title="Create your first project"
              action={
                <Button
                  variant="primary"
                  icon={<Plus className="size-4" />}
                  onClick={() => setFormOpen(true)}
                >
                  New project
                </Button>
              }
            >
              Projects group related tasks and show how far along the work is.
            </EmptyState>
          )
        ) : (
          <>
            <ul className="divide-y divide-line">
              {query.data.data.map((project) => (
                <li
                  key={project.id}
                  className="group relative flex flex-col gap-3 px-4 py-4 hover:bg-sunken/60 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <Link
                        to={`/projects/${project.id}`}
                        className="truncate text-[15px] font-semibold after:absolute after:inset-0 hover:text-violet"
                      >
                        {project.name}
                      </Link>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                      {project.description || formatRange(project.startDate, project.endDate)}
                    </p>
                  </div>

                  <div className="w-full sm:w-56">
                    <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                      <span className="tabular text-ink-muted">
                        {project.taskStats.completed}/{project.taskStats.total} tasks
                        {project.taskStats.overdue > 0 && (
                          <span className="ml-2 text-red">{project.taskStats.overdue} overdue</span>
                        )}
                      </span>
                      <span className="tabular font-medium">{project.taskStats.progress}%</span>
                    </div>
                    <Beam stats={project.taskStats} />
                  </div>

                  <div className="hidden w-44 text-[13px] text-ink-muted lg:block">
                    {formatRange(project.startDate, project.endDate)}
                  </div>

                  <div className="absolute top-3 right-3 z-10 sm:static">
                    <Menu
                      label={`Actions for ${project.name}`}
                      items={[
                        {
                          label: 'Edit',
                          icon: <Pencil className="size-4" />,
                          onSelect: () => {
                            setEditing(project);
                            setFormOpen(true);
                          },
                        },
                        {
                          label: 'Delete',
                          icon: <Trash2 className="size-4" />,
                          danger: true,
                          onSelect: () => setDeleting(project),
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={query.data.meta} onPage={(p) => set({ page: p })} />
          </>
        )}
      </Panel>

      <ProjectFormDialog open={formOpen} onClose={() => setFormOpen(false)} project={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this project?"
        description={
          deleting && (
            <>
              “{deleting.name}” and its {deleting.taskStats.total}{' '}
              {deleting.taskStats.total === 1 ? 'task' : 'tasks'} will be deleted on web and mobile.
              This can’t be undone.
            </>
          )
        }
        confirmLabel="Delete project"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Project deleted');
              setDeleting(null);
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </>
  );
}
