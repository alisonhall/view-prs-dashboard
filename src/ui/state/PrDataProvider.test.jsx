/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { PrDataProvider } = require('./PrDataProvider');

describe('PrDataProvider', () => {
  afterEach(() => {
    delete window.updateReactPrTable;
    delete window.getReactPrTablePayload;
    delete window.getReactPrTableSelectedRepo;
    delete window.updateReactSelectedAuthorLogin;
    delete window.updateReactStatsViewState;
  });

  test('given an initial payload, when rendering, then window.getReactPrTablePayload returns it', () => {
    const payload = { byPrNumber: { 1: {} } };
    render(
      <PrDataProvider initialPayload={payload}>
        <div />
      </PrDataProvider>,
    );

    expect(window.getReactPrTablePayload()).toBe(payload);
  });

  // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md): this
  // read bridge exists specifically so a handful of index.page.js DI
  // wirings can read the same payload the visible React table is showing,
  // instead of a second, independently-timed vanilla copy - it must always
  // return the LATEST payload, not whatever was current when the bridge was
  // first assigned (a stale closure here would defeat the entire point).
  test('given window.updateReactPrTable pushes a new payload, when getReactPrTablePayload is called again, then it returns the new payload, not a stale one', () => {
    const payloadA = { byPrNumber: { 1: {} } };
    render(
      <PrDataProvider initialPayload={payloadA}>
        <div />
      </PrDataProvider>,
    );
    expect(window.getReactPrTablePayload()).toBe(payloadA);

    const payloadB = { byPrNumber: { 1: {}, 2: {} } };
    act(() => {
      window.updateReactPrTable(payloadB);
    });

    expect(window.getReactPrTablePayload()).toBe(payloadB);
  });

  test('given the provider unmounts, when getReactPrTablePayload is checked, then the bridge is removed', () => {
    const { unmount } = render(
      <PrDataProvider initialPayload={{}}>
        <div />
      </PrDataProvider>,
    );
    expect(typeof window.getReactPrTablePayload).toBe('function');

    unmount();

    expect(window.getReactPrTablePayload).toBeUndefined();
  });

  // Sub-phase 7.2 follow-up (see REACT_MIGRATION_PLAN.md): a dedicated
  // read bridge for selectedRepo alone, mirroring getReactPrTablePayload's
  // own tests above.
  test('given an initial selectedRepo, when rendering, then window.getReactPrTableSelectedRepo returns it', () => {
    render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <div />
      </PrDataProvider>,
    );

    expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo');
  });

  test('given window.updateReactPrTable pushes a new selectedRepo, when getReactPrTableSelectedRepo is called again, then it returns the new value, not a stale one', () => {
    render(
      <PrDataProvider initialSelectedRepo="owner/repo-a">
        <div />
      </PrDataProvider>,
    );
    expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-a');

    act(() => {
      window.updateReactPrTable(undefined, 'owner/repo-b');
    });

    expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-b');
  });

  test('given the provider unmounts, when getReactPrTableSelectedRepo is checked, then the bridge is removed', () => {
    const { unmount } = render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <div />
      </PrDataProvider>,
    );
    expect(typeof window.getReactPrTableSelectedRepo).toBe('function');

    unmount();

    expect(window.getReactPrTableSelectedRepo).toBeUndefined();
  });
});
