import { useRepoLabels } from '../../state/RepoLabelsContext';

/**
 * Run & check's label to apply to the PRs listed: the repo's labels
 * (RepoLabelsContext). Not bound to state: "Apply label" reads its value
 * when clicked (useAckLabelActions).
 */
export function ApplyLabelSelect() {
  const { labels } = useRepoLabels();
  return (
    <select id="apply-label-select">
      <option value="">{labels.length ? 'Choose a label...' : 'No labels found for this repo'}</option>
      {labels.map((label) => (
        <option key={label.name} value={label.name}>
          {label.name}
        </option>
      ))}
    </select>
  );
}
