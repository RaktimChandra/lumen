import { formatDate } from '@lumen/shared';

export function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'No dates set';
  if (start && !end) return `From ${formatDate(start)}`;
  if (!start && end) return `Until ${formatDate(end)}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
}
