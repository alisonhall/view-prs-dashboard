/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReviewStatsControls } = require('./ReviewStatsControls');
const { ReviewStatsContext, defaultReviewStats } = require('../state/ReviewStatsContext');

const DEFAULT_STATE = {
  sortBy: 'riskyApprovals',
  filterMode: 'all',
  topN: 12,
  minComments: 0,
  startDate: '2026-01-01',
  endDate: '',
};

const renderControls = (statsViewState = DEFAULT_STATE, setStatsViewState = () => {}) =>
  render(
    <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState, setStatsViewState }}>
      <ReviewStatsControls />
    </ReviewStatsContext.Provider>,
  );

describe('ReviewStatsControls', () => {
  test('given statsViewState, when rendering, then all six controls reflect it', () => {
    renderControls();

    expect(screen.getByLabelText('Sort by')).toHaveValue('riskyApprovals');
    expect(screen.getByLabelText('Filter')).toHaveValue('all');
    expect(screen.getByLabelText('Min comments')).toHaveValue(0);
    expect(screen.getByLabelText('Top reviewers')).toHaveValue(12);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End date')).toHaveValue('');
  });

  test('given a user selects a different sort option, when selecting, then setStatsViewState fires immediately with just that patch', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    renderControls(DEFAULT_STATE, setStatsViewState);

    await user.selectOptions(screen.getByLabelText('Sort by'), 'reviews');

    expect(screen.getByLabelText('Sort by')).toHaveValue('reviews');
    expect(setStatsViewState).toHaveBeenCalledTimes(1);
    expect(setStatsViewState).toHaveBeenCalledWith({ sortBy: 'reviews' });
  });

  test('given a user selects a different filter mode, when selecting, then setStatsViewState fires with that patch', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    renderControls(DEFAULT_STATE, setStatsViewState);

    await user.selectOptions(screen.getByLabelText('Filter'), 'risky-only');

    expect(setStatsViewState).toHaveBeenCalledWith({ filterMode: 'risky-only' });
  });

  // Regression coverage: minComments/topN must only commit (call
  // setStatsViewState, which triggers a full stats recompute) on blur,
  // matching the original vanilla control's native "change" handler - not
  // on every keystroke, which React's onChange alone would do.
  test('given a user types into Min comments, when typing (not yet blurred), then setStatsViewState has not fired', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    renderControls(DEFAULT_STATE, setStatsViewState);

    const input = screen.getByLabelText('Min comments');
    await user.clear(input);
    await user.type(input, '5');

    expect(input).toHaveValue(5);
    expect(setStatsViewState).not.toHaveBeenCalled();
  });

  test('given a user types into Min comments and then blurs, then setStatsViewState fires once with the clamped numeric value', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    render(
      <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState: DEFAULT_STATE, setStatsViewState }}>
        <ReviewStatsControls />
        <button type="button">elsewhere</button>
      </ReviewStatsContext.Provider>,
    );

    const input = screen.getByLabelText('Min comments');
    await user.clear(input);
    await user.type(input, '5');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(setStatsViewState).toHaveBeenCalledTimes(1);
    expect(setStatsViewState).toHaveBeenCalledWith({ minComments: 5 });
  });

  test('given Min comments is blurred empty, then it clamps to 0, not NaN', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    render(
      <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState: DEFAULT_STATE, setStatsViewState }}>
        <ReviewStatsControls />
        <button type="button">elsewhere</button>
      </ReviewStatsContext.Provider>,
    );

    const input = screen.getByLabelText('Min comments');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(setStatsViewState).toHaveBeenCalledWith({ minComments: 0 });
  });

  test('given Top reviewers is blurred empty, then it clamps to 12 (the original default), not NaN', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    render(
      <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState: DEFAULT_STATE, setStatsViewState }}>
        <ReviewStatsControls />
        <button type="button">elsewhere</button>
      </ReviewStatsContext.Provider>,
    );

    const input = screen.getByLabelText('Top reviewers');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(setStatsViewState).toHaveBeenCalledWith({ topN: 12 });
  });

  test('given a user changes the start date, when changing, then setStatsViewState fires with the trimmed date patch', () => {
    const setStatsViewState = jest.fn();
    renderControls(DEFAULT_STATE, setStatsViewState);

    const input = screen.getByLabelText('Start date');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    nativeSetter.call(input, '2026-02-15');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setStatsViewState).toHaveBeenCalledWith({ startDate: '2026-02-15' });
  });
});
