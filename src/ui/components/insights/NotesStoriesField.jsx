/**
 * NotesStoriesField - the Notes "Stories" list: one row per story, each a
 * name and a URL input, with add/remove controls. Removing the last
 * remaining row clears it instead of deleting it, so there's always at
 * least one row.
 *
 * @module components/insights/NotesStoriesField
 */

import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';

const EMPTY_STORY = { name: '', url: '' };

export function NotesStoriesField({ stories, onChange }) {
  const safeStories = stories.length ? stories : [EMPTY_STORY];

  const handleStoryChange = (index, patch) => {
    onChange(safeStories.map((story, i) => (i === index ? { ...story, ...patch } : story)));
  };

  const handleRemove = (index) => {
    if (safeStories.length <= 1) {
      onChange([EMPTY_STORY]);
      return;
    }
    onChange(safeStories.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...safeStories, EMPTY_STORY]);
  };

  // role="group" (not a <label> around everything): a <label> may only be
  // associated with one control, and an invalid one can confuse browsers'/
  // extensions' form-field heuristics (Chrome's autofill has misclassified
  // these inputs and thrown on focus). The non-credential props guard
  // against the same misclassification.
  return (
    <div className="pr-notes-label" role="group" aria-label="Stories">
      <div className="pr-notes-multi-header">
        <span>Stories</span>
        <button type="button" className="pr-notes-add-entry" aria-label="Add story" title="Add story" onClick={handleAdd}>
          +
        </button>
      </div>
      <div className="pr-notes-multi-list">
        {safeStories.map((story, index) => (
          <div key={index} className="pr-notes-multi-row pr-notes-story-row">
            <input
              type="text"
              className="pr-notes-input pr-notes-multi-input pr-notes-story-name-input"
              aria-label={`Story ${index + 1} name`}
              placeholder="US12345"
              value={story.name}
              onChange={(e) => handleStoryChange(index, { name: e.target.value })}
              {...NON_CREDENTIAL_INPUT_PROPS}
            />
            <input
              type="text"
              className="pr-notes-input pr-notes-multi-input pr-notes-story-url-input"
              aria-label={`Story ${index + 1} URL`}
              placeholder="https://..."
              value={story.url}
              onChange={(e) => handleStoryChange(index, { url: e.target.value })}
              {...NON_CREDENTIAL_INPUT_PROPS}
            />
            <button
              type="button"
              className="pr-notes-remove-entry"
              aria-label={`Remove story ${index + 1}`}
              title={`Remove story ${index + 1}`}
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
