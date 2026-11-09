import { useFilterState } from '../../state/FilterStateContext';

/**
 * Run script's "Open mode": which PRs the script opens in the browser
 * after a run (none, the changed ones, or all). FilterStateContext's
 * `openMode`.
 */
export function OpenModeSelect({ describedBy }: { describedBy?: string }) {
  const { values, setValue } = useFilterState();
  return (
    <select
      id="open-mode"
      name="openMode"
      aria-describedby={describedBy}
      value={String(values.openMode ?? 'none')}
      onChange={(event) => setValue('openMode', event.target.value)}
    >
      <option value="none">None</option>
      <option value="changed">The CHANGED ones</option>
      <option value="all">All of them</option>
    </select>
  );
}
