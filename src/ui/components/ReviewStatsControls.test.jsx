/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReviewStatsControls } = require('./ReviewStatsControls');

const DEFAULT_STATE = {
  sortBy: 'riskyApprovals',
  filterMode: 'all',
  topN: 12,
  minComments: 0,
  startDate: '2026-01-01',
  endDate: '',
};

describe('ReviewStatsControls', () => {
  test('given initialState, when rendering, then all six controls reflect it', () => {
    render(<ReviewStatsControls initialState={DEFAULT_STATE} onChange={() => {}} />);

    expect(screen.getByLabelText('Sort by')).toHaveValue('riskyApprovals');
    expect(screen.getByLabelText('Filter')).toHaveValue('all');
    expect(screen.getByLabelText('Min comments')).toHaveValue(0);
    expect(screen.getByLabelText('Top reviewers')).toHaveValue(12);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End date')).toHaveValue('');
  });

  test('given a user selects a different sort option, when selecting, then onChange fires immediately with just that patch', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Sort by'), 'reviews');

    expect(screen.getByLabelText('Sort by')).toHaveValue('reviews');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sortBy: 'reviews' });
  });

  test('given a user selects a different filter mode, when selecting, then onChange fires with that patch', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Filter'), 'risky-only');

    expect(onChange).toHaveBeenCalledWith({ filterMode: 'risky-only' });
  });

  // Regression coverage: minComments/topN must only commit (call onChange,
  // which triggers vanilla's expensive applyFiltersFromCache re-render) on
  // blur, matching the original vanilla control's native "change" handler
  // - not on every keystroke, which React's onChange alone would do and
  // which would re-trigger a full stats recompute mid-edit.
  test('given a user types into Min comments, when typing (not yet blurred), then onChange has not fired', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />);

    const input = screen.getByLabelText('Min comments');
    await user.clear(input);
    await user.type(input, '5');

    expect(input).toHaveValue(5);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('given a user types into Min comments and then blurs, then onChange fires once with the clamped numeric value', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <>
        <ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />
        <button type="button">elsewhere</button>
      </>,
    );

    const input = screen.getByLabelText('Min comments');
    await user.clear(input);
    await user.type(input, '5');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ minComments: 5 });
  });

  test('given Min comments is blurred empty, then it clamps to 0, not NaN', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <>
        <ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />
        <button type="button">elsewhere</button>
      </>,
    );

    const input = screen.getByLabelText('Min comments');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(onChange).toHaveBeenCalledWith({ minComments: 0 });
  });

  test('given Top reviewers is blurred empty, then it clamps to 12 (the original default), not NaN', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <>
        <ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />
        <button type="button">elsewhere</button>
      </>,
    );

    const input = screen.getByLabelText('Top reviewers');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(onChange).toHaveBeenCalledWith({ topN: 12 });
  });

  test('given a user changes the start date, when changing, then onChange fires with the trimmed date patch', () => {
    const onChange = jest.fn();
    render(<ReviewStatsControls initialState={DEFAULT_STATE} onChange={onChange} />);

    const input = screen.getByLabelText('Start date');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    nativeSetter.call(input, '2026-02-15');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-02-15' });
  });
});
