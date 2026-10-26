// The Settings drawer's fields bound to FilterStateContext keys
// (UI_REDESIGN_PLAN.md, phase 9b). The script reads them when "Run script"
// is clicked (useFormBody); FilterStateProvider saves them.

export interface SettingsTextField {
  id: string;
  name: string;
  key: string;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  defaultValue: string;
}

export interface SettingsCheckboxField {
  id: string;
  name: string;
  key: string;
  label: string;
  defaultValue: boolean;
}

// Run & check: the PR numbers to run on. PrSelectionCell's row checkboxes
// write into the same key.
export const PR_NUMBERS_FIELD: SettingsTextField = {
  id: 'pr-numbers',
  name: 'prNumbers',
  key: 'prNumbersInput',
  label: 'PR number(s) (comma-separated)',
  type: 'text',
  placeholder: '912,921',
  defaultValue: '',
};

// Script options: rarely changed.
export const SCRIPT_TEXT_FIELDS: readonly SettingsTextField[] = [
  { id: 'repo', name: 'repo', key: 'repo', label: 'Repo (owner/name)', type: 'text', placeholder: 'owner/repo', defaultValue: '' },
  { id: 'limit', name: 'limit', key: 'limit', label: 'Open PR limit', type: 'number', placeholder: '200', defaultValue: '' },
  { id: 'merged-limit', name: 'mergedLimit', key: 'mergedLimit', label: 'Merged PR limit', type: 'number', placeholder: '15', defaultValue: '' },
  { id: 'jobs', name: 'jobs', key: 'jobs', label: 'Parallel jobs', type: 'number', placeholder: '6', defaultValue: '' },
];

export const SCRIPT_CHECKBOX_FIELDS: readonly SettingsCheckboxField[] = [
  { id: 'ack-changed', name: 'ackChanged', key: 'ackChanged', label: 'Ack all CHANGED non-draft PRs from this run', defaultValue: false },
  { id: 'show-reason', name: 'showReason', key: 'showReason', label: 'Show CHANGED reason in status', defaultValue: true },
  { id: 'quiet', name: 'quiet', key: 'quiet', label: 'Quiet mode (hide run metadata header)', defaultValue: false },
];
