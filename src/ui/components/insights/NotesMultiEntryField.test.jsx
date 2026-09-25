/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { NotesMultiEntryField } = require('./NotesMultiEntryField');

describe('NotesMultiEntryField', () => {
  test('given a single empty value, when rendering, then shows one input row', () => {
    render(<NotesMultiEntryField title="Rally stories" placeholder="US12345" values={['']} inputClassName="x" onChange={() => {}} />);
    expect(document.querySelectorAll('.pr-notes-multi-row')).toHaveLength(1);
  });

  test('given the "+" button, when clicked, then onChange receives an appended empty entry', () => {
    const onChange = jest.fn();
    render(<NotesMultiEntryField title="Rally stories" placeholder="x" values={['US1']} inputClassName="x" onChange={onChange} />);
    screen.getByRole('button', { name: 'Add Rally stories entry' }).click();
    expect(onChange).toHaveBeenCalledWith(['US1', '']);
  });

  test('given the last remaining row, when its "-" is clicked, then onChange clears it instead of removing it', () => {
    const onChange = jest.fn();
    render(<NotesMultiEntryField title="Rally stories" placeholder="x" values={['US1']} inputClassName="x" onChange={onChange} />);
    screen.getByRole('button', { name: 'Remove Rally stories entry' }).click();
    expect(onChange).toHaveBeenCalledWith(['']);
  });

  test('given two rows, when the first is removed, then onChange receives only the remaining value', () => {
    const onChange = jest.fn();
    render(<NotesMultiEntryField title="Rally stories" placeholder="x" values={['US1', 'US2']} inputClassName="x" onChange={onChange} />);
    screen.getAllByRole('button', { name: 'Remove Rally stories entry' })[0].click();
    expect(onChange).toHaveBeenCalledWith(['US2']);
  });
});
