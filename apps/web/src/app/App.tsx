import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { lazy } from 'react';
import { LoginPage, RegisterPage } from '@/features/auth/AuthPages';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { queryClient } from '@/lib/query';
import { AppLayout } from './AppLayout';
import { PublicOnly, RequireAuth, SessionGate } from './SessionGate';
import { NotFoundPage, RouteError } from './RouteError';

// Secondary screens load on demand; the dashboard and sign-in ship in the main bundle.
const ProjectsPage = lazy(() =>
  import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
);
const TasksPage = lazy(() =>
  import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })),
);
const ActivityPage = lazy(() =>
  import('@/features/activity/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export const routes = [
  {
    element: <SessionGate />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: '/projects', element: <ProjectsPage /> },
              { path: '/projects/:projectId', element: <ProjectDetailPage /> },
              { path: '/tasks', element: <TasksPage /> },
              { path: '/activity', element: <ActivityPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/dashboard', element: <Navigate to="/" replace /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: '!bg-surface !text-ink !border-line !shadow-pop',
        }}
      />
    </QueryClientProvider>
  );
}
