import {
  describeDue,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '@lumen/shared';
import { Check, CircleDashed, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PriorityBadge, TaskStatusBadge } from '@/components/ui/Badges';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDeleteTask, useUpdateTask } from './queries';

const STATUS_ICONS: Record<TaskStatus, typeof Check> = {
  PENDING: CircleDashed,
  IN_PROGRESS: PlayCircle,
  COMPLETED: Check,
};

/** Shared row actions: status changes, edit, delete (with confirmation). */
export function useTaskActions(onEdit: (task: Task) => void) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [deleting, setDeleting] = useState<Task | null>(null);

  const setStatus = (task: Task, status: TaskStatus) =>
    update.mutate(
      { id: task.id, input: { status } },
      {
        onSuccess: () => {
          if (status === 'COMPLETED') toast.success(`Completed “${task.name}”`);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  const menuItems = (task: Task): MenuItem[] => [
    ...TASK_STATUSES.filter((status) => status !== task.status).map((status) => {
      const Icon = STATUS_ICONS[status];
      return {
        label: status === 'COMPLETED' ? 'Mark completed' : `Move to ${TASK_STATUS_LABELS[status]}`,
        icon: <Icon className="size-4" />,
        onSelect: () => setStatus(task, status),
      };
    }),
    { label: 'Edit', icon: <Pencil className="size-4" />, onSelect: () => onEdit(task) },
    {
      label: 'Delete',
      icon: <Trash2 className="size-4" />,
      danger: true,
      onSelect: () => setDeleting(task),
    },
  ];

  const confirm = (
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Delete this task?"
      description={
        deleting && (
          <>“{deleting.name}” will be removed from web and mobile. This can’t be undone.</>
        )
      }
      confirmLabel="Delete task"
      loading={remove.isPending}
      onClose={() => setDeleting(null)}
      onConfirm={() =>
        deleting &&
        remove.mutate(deleting.id, {
          onSuccess: () => {
            toast.success('Task deleted');
            setDeleting(null);
          },
          onError: (error) => toast.error(errorMessage(error)),
        })
      }
    />
  );

  return { setStatus, menuItems, confirm };
}

export function CompleteToggle({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const done = task.status === 'COMPLETED';
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen “${task.name}”` : `Mark “${task.name}” completed`}
      className={cn(
        'relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        done
          ? 'border-green bg-green text-on-violet'
          : 'border-line-strong text-transparent hover:border-green hover:text-green/60',
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </button>
  );
}

export function DueLabel({ task }: { task: Task }) {
  if (!task.dueDate) return <span className="text-ink-faint">No due date</span>;
  const done = task.status === 'COMPLETED';
  return (
    <span className={cn('tabular', task.isOverdue ? 'font-medium text-red' : 'text-ink-muted')}>
      {describeDue(task.dueDate, done)}
    </span>
  );
}

export function TaskList({
  tasks,
  showProject,
  onEdit,
}: {
  tasks: Task[];
  showProject?: boolean;
  onEdit: (task: Task) => void;
}) {
  const { setStatus, menuItems, confirm } = useTaskActions(onEdit);

  return (
    <>
      <ul className="divide-y divide-line">
        {tasks.map((task) => {
          const done = task.status === 'COMPLETED';
          return (
            <li
              key={task.id}
              className="flex items-start gap-3.5 px-4 py-3.5 sm:items-center sm:px-5"
            >
              <div className="pt-0.5 sm:pt-0">
                <CompleteToggle
                  task={task}
                  onToggle={() => setStatus(task, done ? 'PENDING' : 'COMPLETED')}
                />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onEdit(task)}
                  className={cn(
                    'block max-w-full truncate text-left text-[15px] font-medium hover:text-violet',
                    done && 'text-ink-muted line-through decoration-ink-faint',
                  )}
                >
                  {task.name}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  {showProject && (
                    <Link
                      to={`/projects/${task.projectId}`}
                      className="truncate text-ink-muted hover:text-ink hover:underline"
                    >
                      {task.projectName}
                    </Link>
                  )}
                  <DueLabel task={task} />
                </div>
              </div>
              <div className="hidden w-20 sm:block">
                <PriorityBadge priority={task.priority} />
              </div>
              <div className="hidden w-28 sm:block">
                <TaskStatusBadge status={task.status} />
              </div>
              <div className="flex items-center gap-2 sm:hidden">
                <PriorityBadge priority={task.priority} compact />
              </div>
              <Menu label={`Actions for ${task.name}`} items={menuItems(task)} />
            </li>
          );
        })}
      </ul>
      {confirm}
    </>
  );
}
