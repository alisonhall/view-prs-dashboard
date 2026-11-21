/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { OPEN_AUTHOR_EVENT } from '../../state/useOpenAuthor';
import type { PrData } from '../../types/pr-data.ts';
import { PrWhoCell } from './PrWhoCell';
import { ActorIdentityContext, defaultActorIdentity } from '../../state/ActorIdentityContext';

// collectPrAuthors is real: these build PR fixtures that drive it.
const renderCell = (pr: PrData, viewerLogin = '') =>
  render(
    <ActorIdentityContext.Provider value={{ ...defaultActorIdentity, getEffectiveViewerLogin: () => viewerLogin, getEffectiveViewerKey: () => viewerLogin }}>
      <table>
        <tbody>
          <tr>
            <PrWhoCell pr={pr} />
          </tr>
        </tbody>
      </table>
    </ActorIdentityContext.Provider>,
  );

const descriptionText = () => {
  const id = document.querySelector('.pr-who-button')?.getAttribute('aria-describedby') || '';
  return document.getElementById(id)?.textContent;
};

describe('PrWhoCell', () => {
  test("shows the author's avatar and name", () => {
    renderCell({ authorLogin: 'octocat', author: 'The Octocat' });
    const who = screen.getByRole('button', { name: 'Author: The Octocat. Open on Authors' });
    expect(who).toHaveTextContent('TO');
    expect(who.querySelector('.pr-who-name')).toHaveTextContent('The Octocat');
  });

  test('marks the viewer\'s own PR', () => {
    renderCell({ authorLogin: 'octocat', author: 'The Octocat' }, 'octocat');
    expect(screen.getByRole('button', { name: 'Author: The Octocat (you). Open on Authors' })).toBeInTheDocument();
    expect(screen.getByText('TO')).toHaveAttribute('data-viewer', 'true');
  });

  test('shows a dash without an author', () => {
    renderCell({});
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  test('adds "+N" for others with non-merge commits, named in the tooltip', () => {
    renderCell({
      authorLogin: 'pr-author',
      author: 'PR Author',
      commits: [{ messageHeadline: 'Fix a bug', authors: [{ login: 'collab-1', name: 'Collaborator One' }] }],
    });
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(descriptionText()).toBe('Author: PR Author\nAlso committed: Collaborator One\nClick to open on Authors');
  });

  test('opens the author on the Authors view when clicked', () => {
    const opened: unknown[] = [];
    const handler = (event: Event) => opened.push((event as CustomEvent).detail);
    window.addEventListener(OPEN_AUTHOR_EVENT, handler);
    renderCell({ authorLogin: 'octocat', author: 'The Octocat' });
    fireEvent.click(screen.getByRole('button', { name: 'Author: The Octocat. Open on Authors' }));
    expect(opened).toEqual([{ login: 'octocat', fallbackName: 'The Octocat', from: screen.getByRole('button', { name: 'Author: The Octocat. Open on Authors' }) }]);
    window.removeEventListener(OPEN_AUTHOR_EVENT, handler);
  });

  test('ignores merge commits', () => {
    renderCell({
      authorLogin: 'pr-author',
      author: 'PR Author',
      commits: [{ messageHeadline: 'Merge branch main into feature', authors: [{ login: 'collab-1', name: 'Collaborator One' }] }],
    });
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
    expect(descriptionText()).toBe('Author: PR Author\nClick to open on Authors');
  });
});
