import { Button, IconButton } from '../ui/Button';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import type { StoryRow } from '../../helpers/pr-notes.helpers.ts';

/**
 * The Notes tab's Stories editor: one row per story, a name and a URL, with
 * add and remove. Removing the last row clears it instead, so there's
 * always one to type into.
 *
 * No <label> around the rows: a <label> may only be associated with one
 * control, and an invalid one confused Chrome's autofill (it misclassified
 * these inputs and threw on focus). The non-credential props guard against
 * the same misclassification.
 */
export interface NotesStoriesFieldProps {
  stories: StoryRow[];
  onChange: (stories: StoryRow[]) => void;
}

const EMPTY_STORY: StoryRow = { name: '', url: '' };

export function NotesStoriesField({ stories, onChange }: NotesStoriesFieldProps) {
  const rows = stories.length ? stories : [EMPTY_STORY];

  const change = (index: number, patch: Partial<StoryRow>) => onChange(rows.map((story, i) => (i === index ? { ...story, ...patch } : story)));
  const remove = (index: number) => onChange(rows.length <= 1 ? [EMPTY_STORY] : rows.filter((_, i) => i !== index));

  return (
    <div className="pr-notes-stories">
      {rows.map((story, index) => (
        // Rows have no id of their own; index keys are fine while each
        // input's value comes from props.
        <div key={index} className="pr-notes-story-row">
          <input
            type="text"
            className="pr-notes-input"
            aria-label={`Story ${index + 1} name`}
            placeholder="US12345"
            value={story.name}
            onChange={(event) => change(index, { name: event.target.value })}
            {...NON_CREDENTIAL_INPUT_PROPS}
          />
          <input
            type="text"
            className="pr-notes-input"
            aria-label={`Story ${index + 1} URL`}
            placeholder="https://..."
            value={story.url}
            onChange={(event) => change(index, { url: event.target.value })}
            {...NON_CREDENTIAL_INPUT_PROPS}
          />
          <IconButton icon="close" label={`Remove story ${index + 1}`} onClick={() => remove(index)} />
        </div>
      ))}
      <Button icon="plus" className="pr-notes-add" onClick={() => onChange([...rows, EMPTY_STORY])}>
        Add story
      </Button>
    </div>
  );
}
