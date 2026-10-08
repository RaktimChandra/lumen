import { timeAgo, type ActivityEntry } from '@lumen/shared';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, KeyRound, ListChecks, Monitor, Smartphone } from 'lucide-react';
import { PageHeader, Panel } from '@/components/PageHeader';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { keys, LIVE_REFRESH_MS } from '@/lib/query';

const ENTITY_ICONS = {
  project: FolderKanban,
  task: ListChecks,
  session: KeyRound,
  user: KeyRound,
} as const;

/** Groups entries under Today / Yesterday / a date heading. */
function groupByDay(entries: ActivityEntry[]) {
  const groups = new Map<string, ActivityEntry[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  for (const entry of entries) {
    const day = new Date(entry.createdAt).toDateString();
    const label =
      day === today
        ? 'Today'
        : day === yesterday
          ? 'Yesterday'
          : new Date(entry.createdAt).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            });
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return [...groups.entries()];
}

export function ActivityPage() {
  useDocumentTitle('Activity');
  const activity = useQuery({
    queryKey: keys.activity,
    queryFn: async () => (await api.activity.list(100)).data,
    refetchInterval: LIVE_REFRESH_MS,
  });

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change to your projects and tasks, from the web and the Android app."
      />
      <Panel>
        {activity.isPending ? (
          <ListSkeleton rows={8} />
        ) : activity.isError ? (
          <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
        ) : activity.data.length === 0 ? (
          <EmptyState title="No activity yet">
            Create a project or task and it will be recorded here.
          </EmptyState>
        ) : (
          groupByDay(activity.data).map(([label, entries]) => (
            <section key={label} className="border-b border-line last:border-b-0">
              <h2 className="bg-sunken/60 px-5 py-2 text-[12px] font-semibold text-ink-muted">
                {label}
              </h2>
              <ol className="divide-y divide-line">
                {entries.map((entry) => {
                  const Icon = ENTITY_ICONS[entry.entityType];
                  const Platform = entry.platform === 'mobile' ? Smartphone : Monitor;
                  return (
                    <li key={entry.id} className="flex items-center gap-3.5 px-5 py-3">
                      <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <p className="min-w-0 flex-1 text-[14px]">{entry.summary}</p>
                      <span
                        className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-faint"
                        title={new Date(entry.createdAt).toLocaleString()}
                      >
                        <Platform
                          className="size-3.5"
                          aria-label={entry.platform === 'mobile' ? 'Android app' : 'Web app'}
                        />
                        {timeAgo(entry.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </Panel>
    </>
  );
}
