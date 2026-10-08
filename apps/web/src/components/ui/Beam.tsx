import type { ProjectTaskStats } from '@lumen/shared';
import { cn } from '@/lib/cn';

/**
 * Project progress drawn as a beam: completed work lit in 532 nm green,
 * work in progress in 488 nm blue, the rest unlit.
 */
export function Beam({
  stats,
  className,
  animate,
}: {
  stats: ProjectTaskStats;
  className?: string;
  animate?: boolean;
}) {
  const pct = (n: number) => (stats.total === 0 ? 0 : (n / stats.total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={stats.progress}
      aria-label={`${stats.progress}% complete, ${stats.completed} of ${stats.total} tasks`}
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}
    >
      <div
        className={cn('h-full bg-green', animate && 'beam-in')}
        style={{ width: `${pct(stats.completed)}%` }}
      />
      <div
        className={cn('h-full bg-blue/70', animate && 'beam-in')}
        style={{ width: `${pct(stats.inProgress)}%` }}
      />
    </div>
  );
}
