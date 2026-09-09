/**
 * NotesMultiEntryField - a labeled list of text inputs with add/remove
 * controls (used for Rally stories / Rally links). Matches vanilla's
 * createMultiEntryField (helpers/pr-notes.helpers.js): removing the last
 * remaining row clears it instead of deleting it, so there's always at
 * least one input.
 *
 * @module components/insights/NotesMultiEntryField
 */

import React from 'react';

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

  return (
    <label className="pr-notes-label">
      <div className="pr-notes-multi-header">
        <span>{title}</span>
        <button type="button" className="pr-notes-add-entry" aria-label={`Add ${title} entry`} title={`Add ${title} entry`} onClick={handleAdd}>
          +
        </button>
      </div>
      <div className="pr-notes-multi-list">
        {safeValues.map((value, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="pr-notes-multi-row">
            <input
              type="text"
              className={`pr-notes-input pr-notes-multi-input ${inputClassName}`}
              placeholder={placeholder}
              value={value}
              onChange={(e) => handleInputChange(index, e.target.value)}
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
    </label>
  );
}
