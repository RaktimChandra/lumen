/** Today's date as `YYYY-MM-DD` in the device's local time zone. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-08` → `8 Oct 2026`. Works without Intl so it behaves the same on Hermes. */
export function formatDate(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return fallback;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Whole days from `from` to the calendar date `date` (negative when in the past). */
export function daysUntil(date: string, from: Date = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const target = Date.UTC(y!, m! - 1, d!);
  const today = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** Short human phrase for a due date: "Due today", "Due in 3 days", "2 days overdue". */
export function describeDue(dueDate: string | null, completed = false, from?: Date): string {
  if (!dueDate) return 'No due date';
  if (completed) return `Due ${formatDate(dueDate)}`;
  const days = daysUntil(dueDate, from);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1 && days <= 14) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  if (days < -1) return `${-days} days overdue`;
  return `Due ${formatDate(dueDate)}`;
}

/** "5 minutes ago" style relative time for ISO timestamps. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(iso.slice(0, 10));
}

/** First letters of the first two words, for avatars. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
