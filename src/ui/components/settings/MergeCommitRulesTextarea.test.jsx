/** @jest-environment jsdom */

const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { MergeCommitRulesTextarea } = require('./MergeCommitRulesTextarea');
const { FilterStateContext } = require('../../state/FilterStateContext');

const renderTextarea = (values, props = {}) => {
  const setValue = jest.fn();
  render(
    <FilterStateContext.Provider value={{ values, setValue }}>
      <MergeCommitRulesTextarea id="merge-commit-headline-patterns" filterStateKey="mergeCommitHeadlinePatterns" {...props} />
    </FilterStateContext.Provider>,
  );
  return { setValue, textarea: screen.getByRole('textbox') };
};

describe('MergeCommitRulesTextarea', () => {
  test('given a value, when edited, then the new text is written to its filter key', () => {
    const { setValue, textarea } = renderTextarea({ mergeCommitHeadlinePatterns: '^Merge\\b' });

    expect(textarea).toHaveValue('^Merge\\b');
    fireEvent.change(textarea, { target: { value: '^Merge\\b\n^Sync' } });
    expect(setValue).toHaveBeenCalledWith('mergeCommitHeadlinePatterns', '^Merge\\b\n^Sync');
  });

  test('given pattern validation and an invalid line, when rendering, then that line is named as skipped', () => {
    renderTextarea({ mergeCommitHeadlinePatterns: '^Merge\\b\n(' }, { validatePatterns: true });

    expect(screen.getByRole('status')).toHaveTextContent('Skipped, not a valid regular expression: "("');
  });

  test('given only valid lines, or no pattern validation, when rendering, then no notice is shown', () => {
    renderTextarea({ mergeCommitHeadlinePatterns: '(' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
