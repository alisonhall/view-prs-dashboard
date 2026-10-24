/** @jest-environment jsdom */

const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { NotesStoriesField } = require('./NotesStoriesField');

describe('NotesStoriesField', () => {
  test('given no stories, when rendering, then shows one empty name/URL row', () => {
    render(<NotesStoriesField stories={[]} onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Story 1 name' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Story 1 URL' })).toHaveValue('');
  });

  test('given a story, when its URL is edited, then onChange receives the row with the new URL and the same name', () => {
    const onChange = jest.fn();
    render(<NotesStoriesField stories={[{ name: 'US1', url: '' }]} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Story 1 URL' }), { target: { value: 'https://x/US1' } });
    expect(onChange).toHaveBeenCalledWith([{ name: 'US1', url: 'https://x/US1' }]);
  });

  test('given the "+" button, when clicked, then onChange receives an appended empty row', () => {
    const onChange = jest.fn();
    render(<NotesStoriesField stories={[{ name: 'US1', url: '' }]} onChange={onChange} />);
    screen.getByRole('button', { name: 'Add story' }).click();
    expect(onChange).toHaveBeenCalledWith([{ name: 'US1', url: '' }, { name: '', url: '' }]);
  });

  test('given the last remaining row, when its "-" is clicked, then onChange clears it instead of removing it', () => {
    const onChange = jest.fn();
    render(<NotesStoriesField stories={[{ name: 'US1', url: 'https://x/US1' }]} onChange={onChange} />);
    screen.getByRole('button', { name: 'Remove story 1' }).click();
    expect(onChange).toHaveBeenCalledWith([{ name: '', url: '' }]);
  });

  test('given two rows, when the first is removed, then onChange receives only the second', () => {
    const onChange = jest.fn();
    render(
      <NotesStoriesField
        stories={[{ name: 'US1', url: '' }, { name: '', url: 'https://x/US2' }]}
        onChange={onChange}
      />,
    );
    screen.getByRole('button', { name: 'Remove story 1' }).click();
    expect(onChange).toHaveBeenCalledWith([{ name: '', url: 'https://x/US2' }]);
  });
});
