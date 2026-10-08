/** Field limits, shared so every client shows the same rules the API enforces. */
export const LIMITS = {
  fullName: { min: 2, max: 100 },
  email: { max: 254 },
  /** bcrypt only uses the first 72 bytes of a password, so longer input is rejected. */
  password: { min: 8, maxBytes: 72 },
  projectName: { min: 1, max: 120 },
  taskName: { min: 1, max: 160 },
  description: { max: 2000 },
  search: { max: 100 },
  page: { max: 10_000 },
  pageSize: { default: 20, max: 100 },
} as const;
