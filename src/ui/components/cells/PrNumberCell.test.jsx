/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrNumberCell } = require('./PrNumberCell');

describe('PrNumberCell', () => {
  test('given a PR with a url, when rendering, then links to that url', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrNumberCell pr={{ number: '101', url: 'https://github.com/owner/repo/pull/101' }} repo="owner/repo" />
          </tr>
        </tbody>
      </table>,
    );
    const link = screen.getByRole('link', { name: '#101' });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pull/101');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('given a PR without a url, when rendering, then builds the url from the repo', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrNumberCell pr={{ number: '202' }} repo="owner/repo" />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByRole('link', { name: '#202' })).toHaveAttribute(
      'href',
      'https://github.com/owner/repo/pull/202',
    );
  });

  test('given a PR, when rendering, then the row carries data-pr-number and a hidden progress indicator', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrNumberCell pr={{ number: '101' }} repo="owner/repo" />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.pr-number-cell')).toHaveAttribute('data-pr-number', '101');
    expect(document.querySelector('.pr-progress-indicator')).not.toBeVisible();
  });
});
