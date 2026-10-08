import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { TASK_STATUS_LABELS, TASK_STATUSES, type Task, type TaskStatus } from '@lumen/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PriorityBadge, statusTone } from '@/components/ui/Badges';
import { cn } from '@/lib/cn';
import { CompleteToggle, DueLabel, useTaskActions } from './TaskList';

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  PENDING: 'bg-slate',
  IN_PROGRESS: 'bg-blue',
  COMPLETED: 'bg-green',
};

function Card({
  task,
  onEdit,
  onToggle,
  overlay,
}: {
  task: Task;
  onEdit?: () => void;
  onToggle?: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: overlay,
  });
  const done = task.status === 'COMPLETED';
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      aria-roledescription="Draggable task"
      aria-label={`${task.name}. ${TASK_STATUS_LABELS[task.status]}. Press space to pick up and move between columns.`}
      className={cn(
        'group cursor-grab rounded-[10px] border border-line bg-surface p-3 text-left touch-none active:cursor-grabbing',
        isDragging && 'opacity-30',
        overlay && 'rotate-[1.5deg] shadow-pop',
      )}
    >
      <div className="flex items-start gap-2.5">
        {onToggle && <CompleteToggle task={task} onToggle={onToggle} />}
        <button
          type="button"
          onClick={onEdit}
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            'min-w-0 flex-1 text-left text-[14px] leading-snug font-medium hover:text-violet',
            done && 'text-ink-muted line-through',
          )}
        >
          {task.name}
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 pl-[32px] text-[12px]">
        <DueLabel task={task} />
        <PriorityBadge priority={task.priority} compact />
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  onAdd,
  children,
}: {
  status: TaskStatus;
  tasks: Task[];
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${TASK_STATUS_LABELS[status]} column`}
      className={cn(
        'flex min-h-48 flex-col rounded-[var(--radius-panel)] border bg-sunken/70 p-2.5 transition-colors',
        isOver ? 'border-violet bg-violet-soft/40' : 'border-line',
      )}
    >
      <header className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <span
            className={cn('size-2 rounded-full', COLUMN_ACCENT[status])}
            aria-hidden
            data-tone={statusTone[status]}
          />
          {TASK_STATUS_LABELS[status]}
          <span className="tabular font-normal text-ink-faint">{tasks.length}</span>
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink"
          aria-label={`Add a task to ${TASK_STATUS_LABELS[status]}`}
        >
          <Plus className="size-4" />
        </button>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
      {tasks.length === 0 && (
        <p className="mt-2 rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-ink-faint">
          Drop a task here
        </p>
      )}
    </section>
  );
}

/** Kanban board: drag a card (mouse, touch or keyboard) to another column to change its status. */
export function TaskBoard({
  tasks,
  onEdit,
  onAdd,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  const { setStatus, confirm } = useTaskActions(onEdit);
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const task = event.active.data.current?.task as Task | undefined;
    const target = event.over?.id as TaskStatus | undefined;
    if (task && target && target !== task.status) setStatus(task, target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => setActive((event.active.data.current?.task as Task) ?? null)}
      onDragCancel={() => setActive(null)}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active: a }) => `Picked up ${(a.data.current?.task as Task)?.name}.`,
          onDragOver: ({ over }) =>
            over ? `Over ${TASK_STATUS_LABELS[over.id as TaskStatus]}.` : 'Not over a column.',
          onDragEnd: ({ over }) =>
            over ? `Moved to ${TASK_STATUS_LABELS[over.id as TaskStatus]}.` : 'Dropped.',
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TASK_STATUSES.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status);
          return (
            <Column key={status} status={status} tasks={columnTasks} onAdd={() => onAdd(status)}>
              {columnTasks.map((task) => (
                <Card
                  key={task.id}
                  task={task}
                  onEdit={() => onEdit(task)}
                  onToggle={() =>
                    setStatus(task, task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED')
                  }
                />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <Card task={active} overlay /> : null}
      </DragOverlay>
      {confirm}
    </DndContext>
  );
}
