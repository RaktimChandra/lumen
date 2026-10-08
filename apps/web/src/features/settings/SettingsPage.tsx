import { formatDate, timeAgo, type Session } from '@lumen/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, ListSkeleton } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDocumentTitle, useSession, useTheme, type Theme } from '@/lib/hooks';
import { keys, queryClient } from '@/lib/query';

function describeDevice(session: Session): string {
  if (session.platform === 'mobile') return 'Lumen for Android';
  const ua = session.userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Linux/.test(ua)
          ? 'Linux'
          : /iPhone|iPad/.test(ua)
            ? 'iOS'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { user } = useSession();
  const [theme, setTheme] = useTheme();
  const sessions = useQuery({
    queryKey: keys.sessions,
    queryFn: async () => (await api.auth.sessions()).data,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: () => {
      toast.success('Device signed out');
      void queryClient.invalidateQueries({ queryKey: keys.sessions });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6">
        <Panel className="p-5">
          <h2 className="text-[15px] font-semibold">Account</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-faint">Name</dt>
              <dd className="mt-0.5 font-medium">{user?.fullName}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Email</dt>
              <dd className="mt-0.5 font-medium break-all">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Member since</dt>
              <dd className="mt-0.5 font-medium">
                {user ? formatDate(user.createdAt.slice(0, 10)) : ''}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[15px] font-semibold">Appearance</h2>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="mt-4 inline-flex rounded-[var(--radius-control)] border border-line-strong p-0.5"
          >
            {(['system', 'light', 'dark'] as Theme[]).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={theme === option}
                onClick={() => setTheme(option)}
                className={cn(
                  'h-8 rounded-[5px] px-3 text-[13px] font-medium capitalize',
                  theme === option ? 'bg-sunken text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {option === 'system' ? 'Match device' : option}
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="p-5 pb-2">
            <h2 className="text-[15px] font-semibold">Signed-in devices</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Sign out anywhere you no longer use Lumen. It takes effect immediately.
            </p>
          </div>
          {sessions.isPending ? (
            <ListSkeleton rows={2} />
          ) : sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
          ) : (
            <ul className="divide-y divide-line">
              {sessions.data.map((session) => {
                const Icon = session.platform === 'mobile' ? Smartphone : Monitor;
                return (
                  <li key={session.id} className="flex items-center gap-4 px-5 py-3.5">
                    <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">
                        {describeDevice(session)}
                        {session.current && (
                          <span className="ml-2 rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-semibold text-green">
                            This device
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-ink-muted">
                        Last active {timeAgo(session.lastUsedAt)}, signed in{' '}
                        {formatDate(session.createdAt.slice(0, 10))}
                      </p>
                    </div>
                    {!session.current && (
                      <Button
                        size="sm"
                        onClick={() => revoke.mutate(session.id)}
                        loading={revoke.isPending && revoke.variables === session.id}
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
