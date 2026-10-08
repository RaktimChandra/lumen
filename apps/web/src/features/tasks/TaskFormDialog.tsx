import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTaskSchema,
  LIMITS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '@lumen/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ApiError, errorMessage } from '@/lib/api';
import { useProjects } from '../projects/queries';
import { useCreateTask, useUpdateTask } from './queries';

type FormValues = z.input<typeof createTaskSchema>;
const FIELDS = ['projectId', 'name', 'description', 'priority', 'status', 'dueDate'] as const;

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  /** Pre-selects (and for new tasks, suggests) this project. */
  projectId?: string;
  defaultStatus?: TaskStatus;
}

function toFormValues(
  task: Task | null | undefined,
  projectId?: string,
  status?: TaskStatus,
): FormValues {
  return {
    projectId: task?.projectId ?? projectId ?? '',
    name: task?.name ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'MEDIUM',
    status: task?.status ?? status ?? 'PENDING',
    dueDate: task?.dueDate ?? '',
  };
}

export function TaskFormDialog({
  open,
  onClose,
  task,
  projectId,
  defaultStatus,
}: TaskFormDialogProps) {
  const editing = Boolean(task);
  const projects = useProjects({ limit: 100, sort: 'name', order: 'asc' });
  const create = useCreateTask();
  const update = useUpdateTask();
  const form = useForm<FormValues, unknown, z.output<typeof createTaskSchema>>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: toFormValues(task, projectId, defaultStatus),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(toFormValues(task, projectId, defaultStatus));
  }, [open, task, projectId, defaultStatus, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (task) await update.mutateAsync({ id: task.id, input: values });
      else await create.mutateAsync(values);
      toast.success(task ? 'Task saved' : 'Task added');
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length) {
        for (const detail of error.details) {
          if ((FIELDS as readonly string[]).includes(detail.path)) {
            form.setError(detail.path as (typeof FIELDS)[number], { message: detail.message });
          }
        }
      } else if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        form.setError('projectId', {
          message: 'That project no longer exists. Choose another one.',
        });
      } else {
        toast.error(errorMessage(error));
      }
    }
  });

  const projectOptions = projects.data?.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Edit task' : 'New task'}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Task name" error={errors.name?.message}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.register('name')}
              autoFocus
              maxLength={LIMITS.taskName.max}
              placeholder="e.g. Align the 785 nm laser"
            />
          )}
        </Field>
        <Field label="Project" error={errors.projectId?.message}>
          {(a11y) => (
            <Select {...a11y} {...form.register('projectId')} disabled={projects.isPending}>
              <option value="" disabled>
                {projects.isPending ? 'Loading projects…' : 'Choose a project'}
              </option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Description" optional error={errors.description?.message}>
          {(a11y) => (
            <Textarea
              {...a11y}
              {...form.register('description')}
              maxLength={LIMITS.description.max}
              placeholder="Notes, links, acceptance criteria"
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Status" error={errors.status?.message}>
            {(a11y) => (
              <Select {...a11y} {...form.register('status')}>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Priority" error={errors.priority?.message}>
            {(a11y) => (
              <Select {...a11y} {...form.register('priority')}>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date" optional error={errors.dueDate?.message}>
            {(a11y) => <Input {...a11y} {...form.register('dueDate')} type="date" />}
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {editing ? 'Save changes' : 'Add task'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
