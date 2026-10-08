import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  createTaskSchema,
  isRealCalendarDate,
  loginSchema,
  registerSchema,
  taskListQuerySchema,
  updateProjectSchema,
  updateTaskSchema,
} from './schemas';
import { describeDue, formatDate } from './format';

const issues = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? [];

describe('registerSchema', () => {
  it('accepts a valid registration and normalises email', () => {
    const parsed = registerSchema.parse({
      fullName: '  Ada Lovelace ',
      email: '  ADA@Example.COM ',
      password: 'analytical1',
    });
    expect(parsed).toEqual({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'analytical1',
    });
  });

  it('reports every missing field', () => {
    const result = registerSchema.safeParse({});
    expect(issues(result)).toEqual(
      expect.arrayContaining([
        'fullName: Full name is required',
        'email: Email is required',
        'password: Password is required',
      ]),
    );
  });

  it.each([
    ['not-an-email', 'Enter a valid email address'],
    ['a@b', 'Enter a valid email address'],
    ['', 'Email is required'],
  ])('rejects email %j', (email, message) => {
    const result = registerSchema.safeParse({ fullName: 'Ada', email, password: 'abcdefg1' });
    expect(issues(result)).toContain(`email: ${message}`);
  });

  it.each([
    ['short1', 'at least 8 characters'],
    ['onlyletters', 'one letter and one number'],
    ['12345678', 'one letter and one number'],
    [' padded123 ', 'cannot start or end with a space'],
    ['a1' + 'é'.repeat(36), 'at most 72 bytes'],
  ])('rejects weak password %j', (password, fragment) => {
    const result = registerSchema.safeParse({ fullName: 'Ada', email: 'a@b.co', password });
    expect(issues(result).join('\n')).toContain(fragment);
  });

  it('rejects unknown keys so clients cannot mass-assign fields', () => {
    const result = registerSchema.safeParse({
      fullName: 'Ada',
      email: 'a@b.co',
      password: 'abcdefg1',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only names', () => {
    const result = registerSchema.safeParse({
      fullName: '   ',
      email: 'a@b.co',
      password: 'abcdefg1',
    });
    expect(issues(result)).toContain('fullName: Full name must be at least 2 characters');
  });
});

describe('loginSchema', () => {
  it('does not apply password strength rules at login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});

describe('project schemas', () => {
  it('applies defaults on create', () => {
    expect(createProjectSchema.parse({ name: 'Spectrometer' })).toEqual({
      name: 'Spectrometer',
      description: '',
      status: 'NOT_STARTED',
      startDate: null,
      endDate: null,
    });
  });

  it('rejects an end date before the start date', () => {
    const result = createProjectSchema.safeParse({
      name: 'X',
      startDate: '2026-10-10',
      endDate: '2026-10-01',
    });
    expect(issues(result)).toContain('endDate: End date cannot be before the start date');
  });

  it.each(['2026-02-30', '2026-13-01', '10/08/2026', '2026-1-1', 'tomorrow'])(
    'rejects invalid date %j',
    (startDate) => {
      expect(createProjectSchema.safeParse({ name: 'X', startDate }).success).toBe(false);
    },
  );

  it('treats a blank date as null', () => {
    expect(createProjectSchema.parse({ name: 'X', startDate: '' }).startDate).toBeNull();
  });

  it('rejects an invalid status value', () => {
    const result = createProjectSchema.safeParse({ name: 'X', status: 'DONE' });
    expect(issues(result)[0]).toContain(
      'Status must be one of: NOT_STARTED, IN_PROGRESS, COMPLETED',
    );
  });

  it('does not reset untouched fields on update', () => {
    expect(updateProjectSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('requires at least one field on update', () => {
    expect(issues(updateProjectSchema.safeParse({}))).toContain(
      ': Provide at least one field to update',
    );
  });
});

describe('task schemas', () => {
  const projectId = '7f1c2a54-6a55-4d3f-9a0d-2a6f1c0b8e11';

  it('applies defaults on create', () => {
    expect(createTaskSchema.parse({ projectId, name: 'Calibrate laser' })).toMatchObject({
      priority: 'MEDIUM',
      status: 'PENDING',
      dueDate: null,
    });
  });

  it('requires a valid project id', () => {
    expect(issues(createTaskSchema.safeParse({ name: 'X' }))).toContain(
      'projectId: Project is required',
    );
    expect(issues(createTaskSchema.safeParse({ name: 'X', projectId: '42' }))).toContain(
      'projectId: Project must be a valid id',
    );
  });

  it('accepts a status-only update', () => {
    expect(updateTaskSchema.parse({ status: 'COMPLETED' })).toEqual({ status: 'COMPLETED' });
  });

  it('rejects invalid priority', () => {
    expect(updateTaskSchema.safeParse({ priority: 'URGENT' }).success).toBe(false);
  });
});

describe('taskListQuerySchema', () => {
  it('coerces paging and applies defaults', () => {
    expect(taskListQuerySchema.parse({ page: '2', overdue: 'true' })).toMatchObject({
      page: 2,
      limit: 20,
      overdue: true,
      sort: 'createdAt',
      order: 'desc',
    });
  });

  it.each([
    { page: '0' },
    { limit: '500' },
    { sort: 'password' },
    { status: 'DONE' },
    { foo: '1' },
  ])('rejects %j', (query) => {
    expect(taskListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('helpers', () => {
  it('validates calendar dates including leap years', () => {
    expect(isRealCalendarDate('2028-02-29')).toBe(true);
    expect(isRealCalendarDate('2027-02-29')).toBe(false);
  });

  it('formats dates and due phrases', () => {
    const today = new Date(2026, 9, 8);
    expect(formatDate('2026-10-08')).toBe('8 Oct 2026');
    expect(describeDue('2026-10-08', false, today)).toBe('Due today');
    expect(describeDue('2026-10-09', false, today)).toBe('Due tomorrow');
    expect(describeDue('2026-10-05', false, today)).toBe('3 days overdue');
    expect(describeDue(null)).toBe('No due date');
  });
});
