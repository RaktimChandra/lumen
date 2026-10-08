import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Logo } from '@/components/Logo';
import { useDocumentTitle } from '@/lib/hooks';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'The page hit an unexpected error.';
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-xl font-semibold">Something broke on this page</h1>
      <p className="text-sm text-ink-muted">
        {message} Reload the page or go back to your dashboard.
      </p>
      <Link to="/" className="text-sm font-medium text-violet underline-offset-4 hover:underline">
        Go to dashboard
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="tabular text-5xl font-semibold text-ink-faint">404</p>
      <h1 className="mt-3 text-lg font-semibold">This page doesn&apos;t exist</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Check the address, or head back to your projects.
      </p>
      <Link
        to="/projects"
        className="mt-5 text-sm font-medium text-violet underline-offset-4 hover:underline"
      >
        View projects
      </Link>
    </div>
  );
}
