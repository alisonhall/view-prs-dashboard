/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDescriptionTab } from './PrDescriptionTab';
import { clearPrDescriptionCache } from '../../state/usePrDescription';

// index.html loads marked and DOMPurify from <script>s; without them the
// markdown renderer fails closed to escaped text.
beforeAll(() => {
  const globals = window as unknown as { DOMPurify: unknown; marked: unknown };
  globals.DOMPurify = jest.requireActual('dompurify');
  globals.marked = jest.requireActual('../../vendor/marked.umd.js');
});

type Answer = { status?: number; body: Record<string, unknown> };
let answers: Answer[];
const fetchMock = jest.fn(async (_url: string) => {
  const { status = 200, body } = answers.shift() ?? { body: { ok: true, body: '' } };
  return { ok: status < 400, status, json: async () => body };
});

beforeEach(() => {
  clearPrDescriptionCache();
  answers = [];
  fetchMock.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

const renderTab = (props: Partial<{ repo: string; prNumber: string; updatedAt: string }> = {}) =>
  render(<PrDescriptionTab repo="acme/app" prNumber="7" updatedAt="2026-11-01T00:00:00Z" {...props} />);

describe('PrDescriptionTab', () => {
  test("shows the PR's description rendered from Markdown, without running anything in it", async () => {
    answers.push({ body: { ok: true, body: '## Why\n\nFixes **the bug**.\n\n<img src=x onerror="window.hacked=1">', fetchedAt: '2026-11-01T01:00:00Z' } });
    renderTab();
    expect(screen.getByText('Loading the description…')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByText('the bug').tagName).toBe('STRONG');
    expect(document.querySelector('img')?.getAttribute('onerror')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/view-prs/pr-description?repo=acme%2Fapp&prNumber=7', expect.anything());
  });

  test('says when there is no description', async () => {
    answers.push({ body: { ok: true, body: '   ' } });
    renderTab();
    expect(await screen.findByText('No description.')).toBeInTheDocument();
  });

  test("an old copy the server couldn't refresh says so; trying again fetches", async () => {
    const user = userEvent.setup();
    answers.push({ body: { ok: true, body: 'Kept.', stale: true, warning: 'gh: network down', fetchedAt: '2026-10-01T00:00:00Z' } });
    answers.push({ body: { ok: true, body: 'Fresh.' } });
    renderTab();
    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't refresh it from GitHub (gh: network down)");
    expect(screen.getByText('Kept.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Fresh.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test("one that couldn't be fetched says why and offers to try again", async () => {
    const user = userEvent.setup();
    answers.push({ status: 502, body: { ok: false, error: 'gh: not logged in' } });
    answers.push({ body: { ok: true, body: 'Now it works.' } });
    renderTab();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the description: gh: not logged in");

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Now it works.')).toBeInTheDocument();
  });

  test('a PR seen before shows at once without asking again, until it changes', async () => {
    answers.push({ body: { ok: true, body: 'First.' } });
    const first = renderTab();
    await screen.findByText('First.');
    first.unmount();

    renderTab();
    expect(screen.getByText('First.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    answers.push({ body: { ok: true, body: 'Changed.' } });
    renderTab({ updatedAt: '2026-11-02T00:00:00Z' });
    await waitFor(() => expect(screen.getByText('Changed.')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
