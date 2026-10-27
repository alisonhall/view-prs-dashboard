/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import type { PrData } from '../../types/pr-data.ts';
import { PrWhoCell } from './PrWhoCell';
import { ActorIdentityContext, defaultActorIdentity } from '../../state/ActorIdentityContext';

// collectPrAuthors is real: these build PR fixtures that drive it.
const renderCell = (pr: PrData, viewerLogin = '') =>
  render(
    <ActorIdentityContext.Provider value={{ ...defaultActorIdentity, getEffectiveViewerLogin: () => viewerLogin }}>
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
  const id = document.querySelector('.ui-tooltip-target')?.getAttribute('aria-describedby') || '';
  return document.getElementById(id)?.textContent;
};

describe('PrWhoCell', () => {
  test('shows the author by name, as initials', () => {
    renderCell({ authorLogin: 'octocat', author: 'The Octocat' });
    expect(screen.getByRole('img', { name: 'Author: The Octocat' })).toHaveTextContent('TO');
  });

  test('marks the viewer\'s own PR', () => {
    renderCell({ authorLogin: 'octocat', author: 'The Octocat' }, 'octocat');
    expect(screen.getByRole('img', { name: 'Author: The Octocat (you)' })).toBeInTheDocument();
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
    expect(descriptionText()).toBe('Author: PR Author\nAlso committed: Collaborator One');
  });

  test('ignores merge commits', () => {
    renderCell({
      authorLogin: 'pr-author',
      author: 'PR Author',
      commits: [{ messageHeadline: 'Merge branch main into feature', authors: [{ login: 'collab-1', name: 'Collaborator One' }] }],
    });
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
    expect(descriptionText()).toBe('Author: PR Author');
  });
});
