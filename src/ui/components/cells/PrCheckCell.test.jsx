/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrCheckCell } = require('./PrCheckCell');

describe('PrCheckCell', () => {
  afterEach(() => {
    delete window.formatChkDisplay;
  });

  test('given a titleDisplay with a CHK marker, when formatChkDisplay is provided, then renders its output', () => {
    window.formatChkDisplay = (titleDisplay) => (String(titleDisplay).includes('[CHK:PASS]') ? '✅ PASS' : '-');
    render(
      <table>
        <tbody>
          <tr>
            <PrCheckCell pr={{ titleDisplay: 'Fix bug [CHK:PASS]' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.check-cell')).toHaveTextContent('✅ PASS');
  });

  test('given no formatChkDisplay helper, when rendering, then falls back to a dash', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrCheckCell pr={{}} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.check-cell')).toHaveTextContent('-');
  });
});
