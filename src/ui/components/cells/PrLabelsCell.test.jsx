/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrLabelsCell } = require('./PrLabelsCell');

describe('PrLabelsCell', () => {
  afterEach(() => {
    delete window.getLabelName;
  });

  test('given no labels, when rendering, then shows a dash', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrLabelsCell pr={{ labels: [] }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.labels-cell')).toHaveTextContent('-');
  });

  test('given plain-string labels, when rendering, then shows a chip per label', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrLabelsCell pr={{ labels: ['bug', 'dependencies'] }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('bug')).toHaveClass('label-chip');
    expect(screen.getByText('dependencies')).toHaveClass('label-chip');
  });

  test('given the same label text, when rendering twice, then produces the same chip color class both times', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrLabelsCell pr={{ labels: ['bug', 'bug'] }} />
          </tr>
        </tbody>
      </table>,
    );
    const chips = screen.getAllByText('bug');
    expect(chips[0].className).toBe(chips[1].className);
  });

  test('given a { name } label object, when getLabelName is provided, then uses it to resolve the label text', () => {
    window.getLabelName = (label) => label?.name || String(label);
    render(
      <table>
        <tbody>
          <tr>
            <PrLabelsCell pr={{ labels: [{ name: 'enhancement' }] }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('enhancement')).toBeInTheDocument();
  });
});
