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
  // Each select's accessible name is exactly the visible label: naming a control from
  // its wrapping <label> leaves the control's own option text out. e2e finds
  // it by role and name; a label-text lookup would fold the options in.
  test('given the controls, when rendering, then the two selects are named exactly "Sort by" and "Show"', () => {
    renderControls();

    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('riskyApprovals');
    expect(screen.getByRole('combobox', { name: 'Show' })).toHaveValue('all');
  });

  test('given statsViewState, when rendering, then all six controls reflect it', () => {
    renderControls();

    expect(screen.getByLabelText('Sort by')).toHaveValue('riskyApprovals');
    expect(screen.getByLabelText('Show')).toHaveValue('all');
    expect(screen.getByLabelText('Minimum comments')).toHaveValue(0);
    expect(screen.getByLabelText('Reviewers to list')).toHaveValue(12);
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

    await user.selectOptions(screen.getByLabelText('Show'), 'risky-only');

    expect(setStatsViewState).toHaveBeenCalledWith({ filterMode: 'risky-only' });
  });

  // Regression coverage: minComments/topN must only commit (call
  // setStatsViewState, which triggers a full stats recompute) on blur,
  // matching the original vanilla control's native "change" handler - not
  // on every keystroke, which React's onChange alone would do.
  test('given a user types into Minimum comments, when typing (not yet blurred), then setStatsViewState has not fired', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    renderControls(DEFAULT_STATE, setStatsViewState);

    const input = screen.getByLabelText('Minimum comments');
    await user.clear(input);
    await user.type(input, '5');

    expect(input).toHaveValue(5);
    expect(setStatsViewState).not.toHaveBeenCalled();
  });

  test('given a user types into Minimum comments and then blurs, then setStatsViewState fires once with the clamped numeric value', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    render(
      <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState: DEFAULT_STATE, setStatsViewState }}>
        <ReviewStatsControls />
        <button type="button">elsewhere</button>
      </ReviewStatsContext.Provider>,
    );

    const input = screen.getByLabelText('Minimum comments');
    await user.clear(input);
    await user.type(input, '5');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(setStatsViewState).toHaveBeenCalledTimes(1);
    expect(setStatsViewState).toHaveBeenCalledWith({ minComments: 5 });
  });

  test('given Minimum comments is blurred empty, then it clamps to 0, not NaN', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    render(
      <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState: DEFAULT_STATE, setStatsViewState }}>
        <ReviewStatsControls />
        <button type="button">elsewhere</button>
      </ReviewStatsContext.Provider>,
    );

    const input = screen.getByLabelText('Minimum comments');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(setStatsViewState).toHaveBeenCalledWith({ minComments: 0 });
  });

  test('given Reviewers to list is blurred empty, then it clamps to 12 (the original default), not NaN', async () => {
    const setStatsViewState = jest.fn();
    const user = userEvent.setup();
    render(
      <ReviewStatsContext.Provider value={{ ...defaultReviewStats, statsViewState: DEFAULT_STATE, setStatsViewState }}>
        <ReviewStatsControls />
        <button type="button">elsewhere</button>
      </ReviewStatsContext.Provider>,
    );

    const input = screen.getByLabelText('Reviewers to list');
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

  test('Show names each choice as the reviewers it lists', () => {
    renderControls();
    expect(Array.from(screen.getByRole('combobox', { name: 'Show' }).options).map((option) => option.textContent)).toEqual([
      'All reviewers',
      'Reviewers with risky approvals',
      'Reviewers with high-risk approvals',
      'Reviewers with useful-comment signals',
    ]);
  });

  test("a change made elsewhere (the table's Clear dates) shows in the controls; a number being typed keeps its text", async () => {
    const user = userEvent.setup();
    const { rerender } = renderControls();
    await user.clear(screen.getByLabelText('Minimum comments'));
    await user.type(screen.getByLabelText('Minimum comments'), '7');

    rerender(
      <ReviewStatsContext.Provider
        value={{ ...defaultReviewStats, statsViewState: { ...DEFAULT_STATE, startDate: '' }, setStatsViewState: () => {} }}
      >
        <ReviewStatsControls />
      </ReviewStatsContext.Provider>,
    );

    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByLabelText('Minimum comments')).toHaveValue(7);
  });
});
