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

  test('given the Ack button, when clicked, then onAckAction fires with isAcked=false (ack, not clear)', () => {
    const onAckAction = jest.fn();
    renderCell({ onAckAction });
    screen.getByRole('button', { name: '✓ Ack' }).click();
    expect(onAckAction).toHaveBeenCalledWith('101', false, 'owner/repo');
  });

  test('given the Clear button, when clicked, then onAckAction fires with isAcked=true (clear, not ack)', () => {
    const onAckAction = jest.fn();
    renderCell({ onAckAction });
    screen.getByRole('button', { name: '✕ Clear' }).click();
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

  test('given the {} button, when clicked, then calls window.openPrJsonModal with an entry carrying the repo', () => {
    const openPrJsonModal = jest.fn();
    window.openPrJsonModal = openPrJsonModal;
    renderCell({ pr: { number: '101' } });
    screen.getByRole('button', { name: 'View PR JSON details for #101' }).click();
    expect(openPrJsonModal).toHaveBeenCalledWith(
      { prNumber: '101', repo: 'owner/repo' },
      { number: '101' },
    );
  });
});
