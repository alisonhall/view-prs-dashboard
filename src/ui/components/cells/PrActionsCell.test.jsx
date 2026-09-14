/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrActionsCell } = require('./PrActionsCell');

describe('PrActionsCell', () => {
  afterEach(() => {
    delete window.runSinglePrUpdate;
    delete window.openPrJsonModal;
  });

  const renderCell = (props = {}) =>
    render(
      <table>
        <tbody>
          <tr>
            <PrActionsCell pr={{ number: '101' }} repo="owner/repo" isFlagged={false} isInReview={false} {...props} />
          </tr>
        </tbody>
      </table>,
    );

  test('given isInReview/isFlagged, when rendering, then reflects checked state on each toggle', () => {
    renderCell({ isInReview: true, isFlagged: false });
    expect(screen.getByLabelText('In Review for PR #101')).toBeChecked();
    expect(screen.getByLabelText('Flagged for PR #101')).not.toBeChecked();
  });

  test('given the In Review checkbox, when toggled, then onCheckboxChange fires with (number, "inReview", checked, repo)', () => {
    const onCheckboxChange = jest.fn();
    renderCell({ onCheckboxChange });
    screen.getByLabelText('In Review for PR #101').click();
    expect(onCheckboxChange).toHaveBeenCalledWith('101', 'inReview', true, 'owner/repo');
  });

  test('given the Flagged checkbox, when toggled, then onCheckboxChange fires with (number, "flagged", checked, repo)', () => {
    const onCheckboxChange = jest.fn();
    renderCell({ onCheckboxChange });
    screen.getByLabelText('Flagged for PR #101').click();
    expect(onCheckboxChange).toHaveBeenCalledWith('101', 'flagged', true, 'owner/repo');
  });

  test('given isAcknowledged=false, when rendering, then the Ack button reads "Ack", is not styled as selected, and aria-pressed is false', () => {
    renderCell({ isAcknowledged: false });
    const button = screen.getByRole('button', { name: '✓ Ack' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.className).not.toContain('is-acked');
  });

  test('given isAcknowledged=true, when rendering, then the Ack button reads "Ack\'d", is styled as selected, and aria-pressed is true', () => {
    renderCell({ isAcknowledged: true });
    const button = screen.getByRole('button', { name: "✓ Ack'd" });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).toContain('is-acked');
  });

  test('given isAcknowledged=false, when the Ack button is clicked, then onAckAction fires with isAcked=false (not-yet-acked -> ack)', () => {
    const onAckAction = jest.fn();
    renderCell({ isAcknowledged: false, onAckAction });
    screen.getByRole('button', { name: '✓ Ack' }).click();
    expect(onAckAction).toHaveBeenCalledWith('101', false, 'owner/repo');
  });

  test('given isAcknowledged=true, when the same button is clicked, then onAckAction fires with isAcked=true (already-acked -> clear)', () => {
    const onAckAction = jest.fn();
    renderCell({ isAcknowledged: true, onAckAction });
    screen.getByRole('button', { name: "✓ Ack'd" }).click();
    expect(onAckAction).toHaveBeenCalledWith('101', true, 'owner/repo');
  });

  test('given the Update button, when clicked, then calls window.runSinglePrUpdate with an entry carrying the repo', async () => {
    const runSinglePrUpdate = jest.fn().mockResolvedValue(undefined);
    window.runSinglePrUpdate = runSinglePrUpdate;
    renderCell({ pr: { number: '101' } });
    screen.getByRole('button', { name: '↻ Update' }).click();
    await Promise.resolve();
    expect(runSinglePrUpdate).toHaveBeenCalledWith(
      { prNumber: '101', repo: 'owner/repo' },
      { number: '101' },
    );
  });

  test('given the {} button and no onViewJson prop, when clicked, then falls back to window.openPrJsonModal with an entry carrying the repo', () => {
    const openPrJsonModal = jest.fn();
    window.openPrJsonModal = openPrJsonModal;
    renderCell({ pr: { number: '101' } });
    screen.getByRole('button', { name: 'View PR JSON details for #101' }).click();
    expect(openPrJsonModal).toHaveBeenCalledWith(
      { prNumber: '101', repo: 'owner/repo' },
      { number: '101' },
    );
  });

  test('given the {} button and an onViewJson prop, when clicked, then calls onViewJson (not window.openPrJsonModal) with an entry carrying the repo', () => {
    const openPrJsonModal = jest.fn();
    window.openPrJsonModal = openPrJsonModal;
    const onViewJson = jest.fn();
    renderCell({ pr: { number: '101' }, onViewJson });
    screen.getByRole('button', { name: 'View PR JSON details for #101' }).click();
    expect(onViewJson).toHaveBeenCalledWith(
      { prNumber: '101', repo: 'owner/repo' },
      { number: '101' },
    );
    expect(openPrJsonModal).not.toHaveBeenCalled();
  });
});
