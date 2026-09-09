/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrStatusCell } = require('./PrStatusCell');

describe('PrStatusCell', () => {
  afterEach(() => {
    delete window.isChangedStatus;
    delete window.statusClass;
    delete window.getViewedFilesState;
    delete window.buildPrLastCheckedIndicator;
  });

  const renderCell = (pr, extra = {}) =>
    render(
      <table>
        <tbody>
          <tr>
            <PrStatusCell pr={pr} lastCheckedAt="2026-01-01T00:00:00Z" sectionKey="open" {...extra} />
          </tr>
        </tbody>
      </table>,
    );

  test('given a plain status, when rendering, then shows the status text and statusClass', () => {
    window.statusClass = (status) => `status-${String(status).toLowerCase()}`;
    renderCell({ status: 'NO_CHANGE' });
    const td = document.querySelector('td');
    expect(td).toHaveClass('status-cell', 'status-no_change');
    expect(td.querySelector('.status-cell-content > div').textContent).toBe('NO_CHANGE');
  });

  test('given a changed status with a reason, when isChangedStatus is true, then appends the reason', () => {
    window.isChangedStatus = (status) => status === 'CHANGED';
    renderCell({ status: 'CHANGED', reason: 'new-commits' });
    expect(document.querySelector('.status-cell-content > div').textContent).toBe('CHANGED(new-commits)');
  });

  test('given viewed-files state, when rendering, then shows the viewed/changed progress', () => {
    window.getViewedFilesState = () => ({ viewedFilesCount: 3, changedFilesCount: 5, isComplete: false, hasUnviewedFiles: true });
    renderCell({});
    const progress = document.querySelector('.approved-viewed-progress');
    expect(progress).toHaveTextContent('3/5');
    expect(progress).toHaveClass('approved-viewed-progress-incomplete');
  });

  test('given a stale last-checked indicator, when rendering, then applies the stale class and title', () => {
    window.buildPrLastCheckedIndicator = () => ({ label: '2h ago', title: 'Checked 2 hours ago', isStale: true });
    renderCell({});
    const indicator = document.querySelector('.pr-last-checked-indicator');
    expect(indicator).toHaveTextContent('2h ago');
    expect(indicator).toHaveClass('pr-last-checked-indicator-stale');
    expect(indicator).toHaveAttribute('title', 'Checked 2 hours ago');
  });
});
