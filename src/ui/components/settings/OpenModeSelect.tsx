import { useFilterState } from '../../state/FilterStateContext';

/**
 * Script options' "Open mode": which PRs the script opens in the browser
 * after a run (none, the changed ones, or all). FilterStateContext's
 * `openMode`.
 */
export function OpenModeSelect() {
  const { values, setValue } = useFilterState();
  return (
    <select id="open-mode" name="openMode" value={String(values.openMode ?? 'none')} onChange={(event) => setValue('openMode', event.target.value)}>
      <option value="none">none</option>
      <option value="changed">changed</option>
      <option value="all">all</option>
    </select>
  );
}
