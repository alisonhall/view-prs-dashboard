/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
const { useMultiSelectDropdownClosing } = require('./useMultiSelectDropdownClosing');

// Window-bridge elimination Phase 7.5: replaces pr-filter-panel.helpers.test.js
// (the helper index.page.js called once at startup is deleted).
function Host() {
  useMultiSelectDropdownClosing();
  return null;
}

describe('useMultiSelectDropdownClosing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <details class="multi-select-dropdown" id="labels" open>
        <summary class="multi-select-summary">Labels</summary>
        <div id="label-list"></div>
      </details>
      <details class="multi-select-dropdown" id="authors" open>
        <summary class="multi-select-summary">Authors</summary>
        <div id="author-list"></div>
      </details>
      <button id="outside"></button>
    `;
  });

  test('given open dropdowns, when a click lands outside them, then they all close', () => {
    render(<Host />);
    document.getElementById('outside').click();

    expect(document.getElementById('labels').open).toBe(false);
    expect(document.getElementById('authors').open).toBe(false);
  });

  test('given open dropdowns, when a click lands inside one, then that one stays open and the others close', () => {
    render(<Host />);
    document.getElementById('label-list').click();

    expect(document.getElementById('labels').open).toBe(true);
    expect(document.getElementById('authors').open).toBe(false);
  });

  test('given a dropdown added after the hook mounted, when a click lands outside it, then it closes too (looked up per click)', () => {
    render(<Host />);
    document.body.insertAdjacentHTML('beforeend', '<details class="multi-select-dropdown" id="late" open></details>');
    document.getElementById('outside').click();

    expect(document.getElementById('late').open).toBe(false);
  });

  test('given the host unmounts, when a click lands outside, then the dropdowns are left alone (listener removed)', () => {
    const { unmount } = render(<Host />);
    unmount();
    document.getElementById('outside').click();

    expect(document.getElementById('labels').open).toBe(true);
  });
});
