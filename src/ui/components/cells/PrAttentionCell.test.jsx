/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrAttentionCell } = require('./PrAttentionCell');

describe('PrAttentionCell', () => {
  test('given neither attention nor flagged, when rendering, then the cell is empty', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrAttentionCell pr={{}} needsAttention={false} isFlagged={false} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.attention-cell').children).toHaveLength(0);
  });

  test('given needsAttention, when rendering, then shows the attention icon with the default title', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrAttentionCell pr={{}} needsAttention isFlagged={false} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('⚠️')).toHaveAttribute('title', 'Needs attention');
  });

  test('given needsAttention with pending comments, when rendering, then uses the pending-comments title', () => {
    const pr = { reviewThreads: [{ comments: [{ state: 'PENDING' }, { state: 'PENDING' }] }] };
    render(
      <table>
        <tbody>
          <tr>
            <PrAttentionCell pr={pr} needsAttention isFlagged={false} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('⚠️')).toHaveAttribute(
      'title',
      'Needs attention — has unsubmitted pending comments',
    );
  });

  test('given isFlagged, when rendering, then shows the flagged icon', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrAttentionCell pr={{}} needsAttention={false} isFlagged />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('🚩')).toHaveAttribute('title', 'PR was flagged');
  });
});
