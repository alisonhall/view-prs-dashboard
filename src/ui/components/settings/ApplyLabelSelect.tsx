import { useRepoLabels, type RepoLabelsStatus } from '../../state/RepoLabelsContext';

/**
 * Run & check's label to apply to the PRs listed: the repo's labels
 * (RepoLabelsContext). Not bound to state: "Apply label" reads its value
 * when clicked (useAckLabelActions).
 */
// With no labels to list: why. "No labels found" only once a request
// answered - not while it's loading, nor when it failed.
const EMPTY_TEXT: Record<RepoLabelsStatus, string> = {
  idle: 'No labels found for this repo',
  loading: 'Loading labels…',
  loaded: 'No labels found for this repo',
  failed: "Couldn't load labels - try Reload labels",
};

export function ApplyLabelSelect() {
  const { labels, labelsStatus = 'idle' } = useRepoLabels();
  return (
    <select id="apply-label-select">
      <option value="">{labels.length ? 'Choose a label...' : EMPTY_TEXT[labelsStatus]}</option>
      {labels.map((label) => (
        <option key={label.name} value={label.name}>
          {label.name}
        </option>
      ))}
    </select>
  );
}
