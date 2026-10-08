import { initials } from '@lumen/shared';
import {
  FolderKanban,
  History,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Settings,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import { ListSkeleton } from '@/components/ui/States';
import { CommandPalette, CommandPaletteTrigger } from '@/features/search/CommandPalette';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession, useTheme } from '@/lib/hooks';
import { session } from '@/lib/session';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/activity', label: 'Activity', icon: History },
];

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function AppLayout() {
  const { user } = useSession();
  const [theme, setTheme] = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  async function signOut() {
    await api.auth.logout(session.get().accessToken);
    session.end('signed-out');
    toast.success('Signed out');
    navigate('/login', { replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors',
                isActive
                  ? 'bg-surface text-ink shadow-[0_1px_0_var(--line)]'
                  : 'text-ink-muted hover:bg-sunken hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="spectrum absolute top-2 bottom-2 left-0 w-[3px] rounded-full"
                    aria-hidden
                  />
                )}
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pt-4">
        <CommandPaletteTrigger />
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line px-3 py-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium',
              isActive ? 'bg-surface text-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink',
            )
          }
        >
          <Settings className="size-[18px]" aria-hidden />
          Settings
        </NavLink>
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex h-10 items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-ink-muted hover:bg-sunken hover:text-ink"
        >
          {isDark ? (
            <Sun className="size-[18px]" aria-hidden />
          ) : (
            <Moon className="size-[18px]" aria-hidden />
          )}
          {isDark ? 'Light theme' : 'Dark theme'}
        </button>
        <div className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-soft text-[12px] font-semibold text-violet">
            {user ? initials(user.fullName) : ''}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user?.fullName}</p>
            <p className="truncate text-[12px] text-ink-muted">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md p-1.5 text-ink-faint hover:bg-sunken hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-canvas lg:block">
        {sidebar}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-2 text-ink-muted hover:bg-sunken"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
        >
          <MenuIcon className="size-5" />
        </button>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-canvas shadow-pop">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 rounded-md p-1.5 text-ink-muted hover:bg-sunken"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <CommandPalette />

      <main id="main" className="min-w-0">
        {!online && (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-amber/30 bg-amber-soft px-5 py-2 text-sm text-amber"
          >
            <WifiOff className="size-4" aria-hidden />
            You&apos;re offline. Changes can&apos;t be saved until your connection is back.
          </div>
        )}
        <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Suspense fallback={<ListSkeleton rows={6} />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
