/** Escape LIKE/ILIKE wildcards so user search text is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

export function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
}

/** Postgres error codes we translate into client errors. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
} as const;

export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  // drizzle wraps driver errors in `cause`
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
