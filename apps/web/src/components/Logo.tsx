import { cn } from '@/lib/cn';

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <path
          d="M11 8v15h11"
          fill="none"
          className="stroke-canvas"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="7" y="26.5" width="18" height="2.2" rx="1.1" fill="url(#logo-beam)" />
        <defs>
          <linearGradient id="logo-beam" x1="0" x2="1">
            <stop offset="0" stopColor="var(--nm405)" />
            <stop offset=".35" stopColor="var(--nm488)" />
            <stop offset=".6" stopColor="var(--nm532)" />
            <stop offset=".8" stopColor="var(--nm589)" />
            <stop offset="1" stopColor="var(--nm635)" />
          </linearGradient>
        </defs>
      </svg>
      {!compact && <span className="text-[17px] font-semibold tracking-tight">Lumen</span>}
    </span>
  );
}
