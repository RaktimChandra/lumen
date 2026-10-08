import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage, RegisterPage } from '@/features/auth/AuthPages';
import { session } from '@/lib/session';
import { renderWithProviders } from './render';

afterEach(() => {
  session.set({ status: 'anonymous', user: null, accessToken: null, endReason: null });
  vi.restoreAllMocks();
});

describe('LoginPage', () => {
  it('validates with the shared schema before calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('explains that the session expired', () => {
    session.set({ status: 'anonymous', endReason: 'expired' });
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session expired. Sign in again to continue.',
    );
  });

  it('shows the server message for wrong credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    renderWithProviders(<LoginPage />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});

describe('RegisterPage', () => {
  it('ticks password rules as the user types', async () => {
    renderWithProviders(<RegisterPage />);
    const rules = screen.getByRole('list', { name: 'Password requirements' });
    expect(rules).toHaveTextContent('(not met yet)');
    await userEvent.type(screen.getByLabelText('Password'), 'photon123');
    expect(rules).not.toHaveTextContent('(not met yet)');
  });

  it('shows a duplicate-email error next to the email field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'CONFLICT',
            message: 'An account with this email already exists.',
            details: [{ path: 'email', message: 'An account with this email already exists.' }],
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    renderWithProviders(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('Full name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'photon123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const email = screen.getByLabelText('Email');
    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
  });
});
