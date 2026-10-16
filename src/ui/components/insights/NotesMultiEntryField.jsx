/**
 * NotesMultiEntryField - a labeled list of text inputs with add/remove
 * controls (used for Rally stories / Rally links). Matches vanilla's
 * createMultiEntryField (helpers/pr-notes.helpers.js): removing the last
 * remaining row clears it instead of deleting it, so there's always at
 * least one input.
 *
 * @module components/insights/NotesMultiEntryField
 */


// Same attributes ReviewStatsControls.jsx's NON_CREDENTIAL_DATE_ATTRS/
// form-parsing.helpers.js's applyCredentialHints set on other text inputs -
// without them, Chrome's password-manager heuristics misclassify these
// fields (e.g. "Rally links" looking like a credential field) and can
// throw inside the browser's own autofill agent on focus, which blocks
// typing in the field entirely.
const NON_CREDENTIAL_ATTRS = {
  autoComplete: 'off',
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
};

export function NotesMultiEntryField({ title, placeholder, values, inputClassName, onChange }) {
  const safeValues = values.length ? values : [''];

  const handleInputChange = (index, value) => {
    const next = safeValues.slice();
    next[index] = value;
    onChange(next);
  };

  const handleRemove = (index) => {
    if (safeValues.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(safeValues.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...safeValues, '']);
  };

  // role="group"/aria-label (not a <label> wrapping the whole thing) -
  // a single <label> is only valid associated with one form control, but
  // this group can render N inputs (one per entry) - wrapping them all in
  // one <label> is invalid HTML that can also confuse a browser's/
  // extension's form-field-purpose heuristics (seen in practice: Chrome's
  // password-manager-style autofill misclassifying one of these inputs
  // and throwing on focus/input).
  return (
    <div className="pr-notes-label" role="group" aria-label={title}>
      <div className="pr-notes-multi-header">
        <span>{title}</span>
        <button type="button" className="pr-notes-add-entry" aria-label={`Add ${title} entry`} title={`Add ${title} entry`} onClick={handleAdd}>
          +
        </button>
      </div>
      <div className="pr-notes-multi-list">
        {safeValues.map((value, index) => (
          <div key={index} className="pr-notes-multi-row">
            <input
              type="text"
              className={`pr-notes-input pr-notes-multi-input ${inputClassName}`}
              placeholder={placeholder}
              value={value}
              onChange={(e) => handleInputChange(index, e.target.value)}
              {...NON_CREDENTIAL_ATTRS}
            />
            <button
              type="button"
              className="pr-notes-remove-entry"
              aria-label={`Remove ${title} entry`}
              title={`Remove ${title} entry`}
              onClick={() => handleRemove(index)}
            >
              -
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
