import { cn } from '@/lib/cn';
import { Select } from './Field';

/** A compact labelled select used in list toolbars. Empty value means "all". */
export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  label: string;
  value: T | '';
  onChange: (value: T | '') => void;
  options: readonly { value: T; label: string }[];
  allLabel: string;
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T | '')}
      className={cn('w-auto max-w-56 min-w-36 text-sm', className)}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
