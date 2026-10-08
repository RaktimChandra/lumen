import { useSearchParams } from 'react-router';

/** Read and write list filters in the URL, so filtered views survive reloads and can be shared. */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<
    K,
    string
  >;
  const page = Math.max(1, Number(params.get('page')) || 1);

  function set(updates: Partial<Record<K | 'page', string | number | null>>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(updates)) {
          if (
            value === null ||
            value === '' ||
            value === undefined ||
            (key === 'page' && value === 1)
          )
            next.delete(key);
          else next.set(key, String(value));
        }
        // Changing a filter returns to the first page.
        if (!('page' in updates)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  return { values, page, set };
}
