import type { PaginationMeta } from '@lumen/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({
  meta,
  onPage,
}: {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}) {
  if (meta.totalPages <= 1) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-line px-4 py-3"
      aria-label="Pagination"
    >
      <p className="tabular text-[13px] text-ink-muted">
        {from}–{to} of {meta.total}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          icon={<ChevronLeft className="size-4" />}
        >
          Previous
        </Button>
        <Button
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
