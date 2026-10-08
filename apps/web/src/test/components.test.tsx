import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PriorityBadge, TaskStatusBadge } from '@/components/ui/Badges';
import { Beam } from '@/components/ui/Beam';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProjectFormDialog } from '@/features/projects/ProjectFormDialog';
import { renderWithProviders } from './render';

describe('Beam', () => {
  it('exposes progress to assistive technology', () => {
    render(
      <Beam
        stats={{ total: 4, completed: 1, inProgress: 2, pending: 1, overdue: 0, progress: 25 }}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAccessibleName('25% complete, 1 of 4 tasks');
  });
});

describe('badges', () => {
  it('render readable labels', () => {
    render(
      <>
        <TaskStatusBadge status="IN_PROGRESS" />
        <PriorityBadge priority="HIGH" />
      </>,
    );
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('calls back on confirm and cancel', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('ProjectFormDialog', () => {
  it('rejects an end date before the start date without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(<ProjectFormDialog open onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Project name'), 'Spectrometer');
    await userEvent.type(screen.getByLabelText(/Start date/), '2026-10-10');
    await userEvent.type(screen.getByLabelText(/End date/), '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('End date cannot be before the start date')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    renderWithProviders(<ProjectFormDialog open onClose={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Project name cannot be empty')).toBeInTheDocument();
  });
});
