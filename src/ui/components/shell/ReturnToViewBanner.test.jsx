/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReturnToViewBanner } = require('./ReturnToViewBanner');
const { TabStateProvider } = require('../TabStateProvider');
const { useTabState } = require('../../state/TabStateContext');
const { useNavigateToPrInTable } = require('../../state/useNavigateToPrInTable');

// The real provider, hook and banner together: a view with its tab and a
// "View in table" button, and the banner.
let tabState;
function App() {
  tabState = useTabState();
  const navigateToPrInTable = useNavigateToPrInTable();
  return (
    <>
      <button type="button" id="tab-author-insights">
        Authors
      </button>
      <section hidden={tabState.activeDataTab !== 'author-insights'}>
        <button type="button" onClick={(event) => navigateToPrInTable('12', { from: event.currentTarget })}>
          View in table
        </button>
      </section>
      <ReturnToViewBanner />
    </>
  );
}

const setUp = () => {
  render(
    <TabStateProvider>
      <App />
    </TabStateProvider>,
  );
  act(() => tabState.setActiveDataTab('author-insights'));
};

describe('ReturnToViewBanner', () => {
  let scrollTo;
  beforeEach(() => {
    scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete window.scrollY;
  });

  test('nothing on the table until "View in table" is used from another view', () => {
    render(
      <TabStateProvider>
        <App />
      </TabStateProvider>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  test('after "View in table": which PR and view, with Back to the view', async () => {
    const user = userEvent.setup();
    setUp();

    await user.click(screen.getByRole('button', { name: 'View in table' }));

    expect(tabState.activeDataTab).toBe('pr-data');
    const banner = screen.getByRole('region', { name: 'Back to Authors' });
    expect(banner).toHaveTextContent('PR #12, from Authors');
    expect(screen.getByRole('button', { name: 'Back to Authors' })).toBeInTheDocument();
  });

  test('Back shows the view again, scrolled as it was, with the focus on the button clicked; then the banner goes', async () => {
    const user = userEvent.setup();
    setUp();
    const viewInTable = screen.getByRole('button', { name: 'View in table' });

    await user.click(viewInTable);
    await user.click(screen.getByRole('button', { name: 'Back to Authors' }));

    expect(tabState.activeDataTab).toBe('author-insights');
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'instant' });
    expect(viewInTable).toHaveFocus();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  test("with the button gone, Back focuses the view's tab", async () => {
    const user = userEvent.setup();
    setUp();
    const viewInTable = screen.getByRole('button', { name: 'View in table' });
    await user.click(viewInTable);
    viewInTable.remove();

    await user.click(screen.getByRole('button', { name: 'Back to Authors' }));

    expect(screen.getByRole('button', { name: 'Authors' })).toHaveFocus();
  });

  test('Dismiss forgets it, staying on the table', async () => {
    const user = userEvent.setup();
    setUp();
    await user.click(screen.getByRole('button', { name: 'View in table' }));

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(tabState.activeDataTab).toBe('pr-data');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  test('showing another view forgets it; showing the table again does not', async () => {
    const user = userEvent.setup();
    setUp();
    await user.click(screen.getByRole('button', { name: 'View in table' }));

    act(() => tabState.setActiveDataTab('pr-data'));
    expect(screen.getByRole('region', { name: 'Back to Authors' })).toBeInTheDocument();

    act(() => tabState.setActiveDataTab('review-stats'));
    act(() => tabState.setActiveDataTab('pr-data'));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  test('"View in table" used from the table itself remembers nothing', () => {
    render(
      <TabStateProvider>
        <App />
      </TabStateProvider>,
    );
    // The view's section is hidden, but its handler is what matters here.
    act(() => screen.getByRole('button', { name: 'View in table', hidden: true }).click());

    expect(tabState.returnTarget).toBeNull();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
