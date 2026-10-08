import { useQuery } from '@tanstack/react-query';
import { FolderKanban, ListChecks, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { TaskStatusBadge } from '@/components/ui/Badges';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/lib/hooks';

interface Result {
  id: string;
  kind: 'project' | 'task';
  title: string;
  subtitle: string;
  href: string;
  task?: { status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' };
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const OPEN_EVENT = 'lumen:open-search';

/** Button that opens the palette. Safe to render in several places. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink-faint hover:border-line-strong hover:text-ink-muted"
    >
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-left">Jump to…</span>
      <kbd className="rounded border border-line px-1.5 font-sans text-[11px]">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  );
}

/** Ctrl/⌘ K: jump to any project or task by name. Mount once. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(term.trim(), 200);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const listId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      setTerm('');
      setActive(0);
    }
  }, [open]);

  const results = useQuery({
    queryKey: ['search', debounced],
    enabled: open && debounced.length > 0,
    queryFn: async ({ signal }): Promise<Result[]> => {
      const [projects, tasks] = await Promise.all([
        api.projects.list({ search: debounced, limit: 5 }, signal),
        api.tasks.list({ search: debounced, limit: 6 }, signal),
      ]);
      return [
        ...projects.data.map<Result>((p) => ({
          id: p.id,
          kind: 'project',
          title: p.name,
          subtitle: `${p.taskStats.total} tasks, ${p.taskStats.progress}% complete`,
          href: `/projects/${p.id}`,
        })),
        ...tasks.data.map<Result>((t) => ({
          id: t.id,
          kind: 'task',
          title: t.name,
          subtitle: t.projectName,
          href: `/projects/${t.projectId}?q=${encodeURIComponent(t.name)}`,
          task: { status: t.status },
        })),
      ];
    },
  });

  const items = debounced ? (results.data ?? []) : [];
  const go = (item: Result | undefined) => {
    if (!item) return;
    setOpen(false);
    navigate(item.href);
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialogRef.current && setOpen(false)}
        aria-label="Search projects and tasks"
        className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-ink shadow-pop"
      >
        {open && (
          <div>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-ink-faint" aria-hidden />
              <input
                autoFocus
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((i) => Math.min(i + 1, items.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    go(items[active]);
                  }
                }}
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls={listId}
                aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
                placeholder="Search projects and tasks"
                className="h-14 flex-1 bg-transparent text-[16px] placeholder:text-ink-faint focus:outline-none"
              />
            </div>
            <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {!debounced && (
                <li className="px-3 py-6 text-center text-sm text-ink-muted">
                  Type to search by name.
                </li>
              )}
              {debounced && results.isFetching && items.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-ink-muted">Searching…</li>
              )}
              {debounced && !results.isFetching && items.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-ink-muted">
                  Nothing matches “{debounced}”.
                </li>
              )}
              {items.map((item, index) => {
                const Icon = item.kind === 'project' ? FolderKanban : ListChecks;
                return (
                  <li
                    key={`${item.kind}-${item.id}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                      index === active && 'bg-sunken',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{item.title}</p>
                      <p className="truncate text-[12px] text-ink-muted">{item.subtitle}</p>
                    </div>
                    {item.task && <TaskStatusBadge status={item.task.status} />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </dialog>
    </>
  );
}
