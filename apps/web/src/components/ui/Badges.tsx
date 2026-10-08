import {
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type ProjectStatus,
  type TaskPriority,
  type TaskStatus,
} from '@lumen/shared';
import { cn } from '@/lib/cn';

type Tone = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'violet';

const tones: Record<Tone, { chip: string; dot: string }> = {
  slate: { chip: 'bg-slate-soft text-ink-muted', dot: 'bg-slate' },
  blue: { chip: 'bg-blue-soft text-blue', dot: 'bg-blue' },
  green: { chip: 'bg-green-soft text-green', dot: 'bg-green' },
  amber: { chip: 'bg-amber-soft text-amber', dot: 'bg-amber' },
  red: { chip: 'bg-red-soft text-red', dot: 'bg-red' },
  violet: { chip: 'bg-violet-soft text-violet', dot: 'bg-violet' },
};

export const statusTone: Record<TaskStatus | ProjectStatus, Tone> = {
  PENDING: 'slate',
  NOT_STARTED: 'slate',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
};

export const priorityTone: Record<TaskPriority, Tone> = {
  LOW: 'slate',
  MEDIUM: 'amber',
  HIGH: 'red',
};

export function Chip({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap',
        tones[tone].chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', tones[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Chip tone={statusTone[status]}>{TASK_STATUS_LABELS[status]}</Chip>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Chip tone={statusTone[status]}>{PROJECT_STATUS_LABELS[status]}</Chip>;
}

/** Priority uses signal bars so it reads without relying on colour alone. */
export function PriorityBadge({
  priority,
  compact,
}: {
  priority: TaskPriority;
  compact?: boolean;
}) {
  const level = priority === 'HIGH' ? 3 : priority === 'MEDIUM' ? 2 : 1;
  const tone = tones[priorityTone[priority]];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted"
      title={`${TASK_PRIORITY_LABELS[priority]} priority`}
    >
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn('w-[3px] rounded-[1px]', bar <= level ? tone.dot : 'bg-line-strong')}
            style={{ height: `${bar * 4}px` }}
          />
        ))}
      </span>
      {compact ? (
        <span className="sr-only">{TASK_PRIORITY_LABELS[priority]} priority</span>
      ) : (
        TASK_PRIORITY_LABELS[priority]
      )}
    </span>
  );
}
