import { zodResolver } from '@hookform/resolvers/zod';
import {
  createProjectSchema,
  LIMITS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type CreateProjectInput,
  type Project,
} from '@lumen/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ApiError, errorMessage } from '@/lib/api';
import { useCreateProject, useUpdateProject } from './queries';

type FormValues = z.input<typeof createProjectSchema>;
const FIELDS = ['name', 'description', 'status', 'startDate', 'endDate'] as const;

function toFormValues(project?: Project | null): FormValues {
  return {
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'NOT_STARTED',
    startDate: project?.startDate ?? '',
    endDate: project?.endDate ?? '',
  };
}

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this project; create a new one when absent. */
  project?: Project | null;
  onSaved?: (project: Project) => void;
}

export function ProjectFormDialog({ open, onClose, project, onSaved }: ProjectFormDialogProps) {
  const editing = Boolean(project);
  const create = useCreateProject();
  const update = useUpdateProject();
  const form = useForm<FormValues, unknown, z.output<typeof createProjectSchema>>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: toFormValues(project),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(toFormValues(project));
  }, [open, project, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = project
        ? await update.mutateAsync({ id: project.id, input: values })
        : await create.mutateAsync(values as CreateProjectInput);
      toast.success(project ? 'Project saved' : 'Project created');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length) {
        for (const detail of error.details) {
          if ((FIELDS as readonly string[]).includes(detail.path)) {
            form.setError(detail.path as (typeof FIELDS)[number], { message: detail.message });
          }
        }
      } else {
        toast.error(errorMessage(error));
      }
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Edit project' : 'New project'}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Project name" error={errors.name?.message}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.register('name')}
              autoFocus
              maxLength={LIMITS.projectName.max}
              placeholder="e.g. Raman spectroscopy rig"
            />
          )}
        </Field>
        <Field label="Description" optional error={errors.description?.message}>
          {(a11y) => (
            <Textarea
              {...a11y}
              {...form.register('description')}
              maxLength={LIMITS.description.max}
              placeholder="What is this project for?"
            />
          )}
        </Field>
        <Field label="Status" error={errors.status?.message}>
          {(a11y) => (
            <Select {...a11y} {...form.register('status')}>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date" optional error={errors.startDate?.message}>
            {(a11y) => <Input {...a11y} {...form.register('startDate')} type="date" />}
          </Field>
          <Field label="End date" optional error={errors.endDate?.message}>
            {(a11y) => <Input {...a11y} {...form.register('endDate')} type="date" />}
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {editing ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
