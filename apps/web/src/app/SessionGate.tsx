import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/hooks';
import { queryClient } from '@/lib/query';
import { session } from '@/lib/session';

/**
 * Restores the session on page load using the httpOnly refresh cookie, and shows a
 * friendly wait screen when the free-tier API is waking up.
 */
export function SessionGate() {
  const state = useSession();
  const [slow, setSlow] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  // StrictMode runs effects twice in development; refs survive, so restore runs once.
  const started = useRef(false);

  const restore = async () => {
    setUnreachable(false);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 2500);
    try {
      const result = await api.auth.refresh();
      session.signIn(result.user, result.accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) setUnreachable(true);
      else session.set({ status: 'anonymous' });
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
    }
  };

  useEffect(() => {
    if (started.current || session.get().status !== 'loading') return;
    started.current = true;
    void restore();
  }, []);

  // Drop cached data as soon as the session ends so the next user never sees it.
  useEffect(() => {
    if (state.status === 'anonymous') queryClient.clear();
  }, [state.status]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo />
        {unreachable ? (
          <div role="alert" className="max-w-sm">
            <p className="font-medium">Can&apos;t reach the Lumen server.</p>
            <p className="mt-1 text-sm text-ink-muted">Check your connection, then try again.</p>
            <Button className="mt-4" variant="primary" onClick={() => void restore()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="w-48">
            <div className="h-0.5 overflow-hidden rounded-full bg-sunken">
              <div className="spectrum h-full w-1/2 animate-[shimmer_1.2s_ease-in-out_infinite] bg-[length:200%_100%]" />
            </div>
            {slow && (
              <p className="mt-4 text-sm text-ink-muted" aria-live="polite">
                Starting the server. The free hosting tier sleeps when idle, so the first load can
                take up to a minute.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return <Outlet />;
}

export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function PublicOnly() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <Outlet />;
}
