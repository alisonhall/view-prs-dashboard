/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrActionsCell, type PrActionsCellProps } from './PrActionsCell';
import { RepoLabelsContext } from '../../state/RepoLabelsContext';
import { CustomSectionMembershipContext, type CustomSectionMembershipValue } from '../../state/CustomSectionMembership';

type Labels = Array<{ name: string }>;

const renderCell = (props: Partial<PrActionsCellProps> = {}, labels?: Labels) => {
  const handlers = {
    onCheckboxChange: jest.fn(),
    onAckAction: jest.fn(),
    onApplyLabel: jest.fn(),
    onUpdatePr: jest.fn(),
    onViewJson: jest.fn(),
  };
  const cell = (
    <table>
      <tbody>
        <tr>
          <PrActionsCell
            pr={{ number: '101' }}
            repo="owner/repo"
            isFlagged={false}
            isInReview={false}
            isAcknowledged={false}
            {...handlers}
            {...props}
          />
        </tr>
      </tbody>
    </table>
  );
  render(
    labels ? (
      <RepoLabelsContext.Provider value={{ labels: [], refresh: () => Promise.resolve(), labelsByRepo: { [props.repo || 'owner/repo']: labels }, ensureLabels: () => {} } as never}>{cell}</RepoLabelsContext.Provider>
    ) : (
      cell
    ),
  );
  return handlers;
};

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'More actions for PR #101' }));
  return screen.getByRole('menu', { name: 'More actions for PR #101' });
};

describe('PrActionsCell', () => {
  describe('custom sections', () => {
    const blockers = { id: 'abc', name: 'Blockers', icon: 'flag' as const, tone: 'danger' as const };
    const later = { id: 'xyz', name: 'Later', icon: 'note' as const, tone: 'muted' as const };
    const renderWithSections = (inSections: string[]) => {
      const membership: CustomSectionMembershipValue = {
        sections: [blockers, later],
        idsFor: jest.fn((repo: string, prNumber: string) => (repo === 'owner/repo' && prNumber === '101' ? inSections : [])),
        setMember: jest.fn(async () => {}),
      };
      render(
        <CustomSectionMembershipContext.Provider value={membership}>
          <table>
            <tbody>
              <tr>
                <PrActionsCell pr={{ number: '101' }} repo="owner/repo" isFlagged={false} isInReview={false} isAcknowledged={false} />
              </tr>
            </tbody>
          </table>
        </CustomSectionMembershipContext.Provider>,
      );
      return membership;
    };

    test('the More menu has Add to or Remove from for each, after Flag, as the PR is in it or not', async () => {
      const user = userEvent.setup();
      renderWithSections(['xyz']);
      const menu = await openMenu(user);
      const labels = within(menu).getAllByRole('menuitem').map((item) => item.textContent);
      expect(labels.slice(0, 4)).toEqual(['Mark in review', 'Flag', 'Add to Blockers', 'Remove from Later']);
    });

    test('choosing one adds the PR to it, or takes it out', async () => {
      const user = userEvent.setup();
      const membership = renderWithSections(['xyz']);
      await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Add to Blockers' }));
      expect(membership.setMember).toHaveBeenLastCalledWith(blockers, 'owner/repo', '101', true);
      await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Remove from Later' }));
      expect(membership.setMember).toHaveBeenLastCalledWith(later, 'owner/repo', '101', false);
    });

    test('without any, the menu has none', async () => {
      const user = userEvent.setup();
      renderCell();
      expect(within(await openMenu(user)).queryByRole('menuitem', { name: /^(Add to|Remove from) / })).not.toBeInTheDocument();
    });
  });


  test('only Ack and the More menu are buttons on the row', () => {
    renderCell();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Ack PR #101',
      'More actions for PR #101',
    ]);
  });

  test('the More menu words In review and Flagged for what choosing them does', async () => {
    const user = userEvent.setup();
    renderCell({ isInReview: false, isFlagged: false });
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Mark in review' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Flag' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });

  test('the More menu\'s Mark in review reports the PR, "inReview", the new state and the repo', async () => {
    const user = userEvent.setup();
    const { onCheckboxChange } = renderCell({ isInReview: false });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Mark in review' }));
    expect(onCheckboxChange).toHaveBeenCalledWith('101', 'inReview', true, 'owner/repo');
  });

  test('when flagged and in review, the More menu offers to remove them, reporting false', async () => {
    const user = userEvent.setup();
    const { onCheckboxChange } = renderCell({ isFlagged: true, isInReview: true });
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Remove from in review' })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove flag' }));
    expect(onCheckboxChange).toHaveBeenCalledWith('101', 'flagged', false, 'owner/repo');
  });

  test('Ack reads "Ack" until acknowledged, then "Ack\'d", pressed', () => {
    renderCell({ isAcknowledged: true });
    // Saying a second click undoes it (as if never made).
    expect(screen.getByRole('button', { name: "Ack'd PR #101", pressed: true })).toHaveAccessibleDescription('Click again to undo the Ack');
  });

  test('on the selected row, Ack names its key, a, in its tooltip and for screen readers', () => {
    renderCell({ isAcknowledged: false, isSelected: true });
    const ack = screen.getByRole('button', { name: 'Ack PR #101' });
    expect(ack).toHaveAttribute('aria-keyshortcuts', 'a');
    expect(ack.closest('[data-tip]')).toHaveAttribute('data-tip', 'Ack PR #101 (A)');
  });

  test("on other rows, where the key doesn't work, Ack doesn't name it", () => {
    renderCell({ isAcknowledged: false });
    const ack = screen.getByRole('button', { name: 'Ack PR #101' });
    expect(ack).not.toHaveAttribute('aria-keyshortcuts');
    expect(ack.closest('[data-tip]')).toHaveAttribute('data-tip', 'Ack PR #101');
  });

  test('Ack has nothing to undo before it\'s acknowledged', () => {
    renderCell({ isAcknowledged: false });
    expect(screen.getByRole('button', { name: 'Ack PR #101', pressed: false })).not.toHaveAccessibleDescription();
  });

  test('Ack passes whether the PR is acked now, so it acks or clears', async () => {
    const user = userEvent.setup();
    const { onAckAction } = renderCell({ isAcknowledged: false });
    await user.click(screen.getByRole('button', { name: 'Ack PR #101', pressed: false }));
    expect(onAckAction).toHaveBeenCalledWith('101', false, 'owner/repo');
  });

  test('the More menu\'s Update PR passes the PR number and an entry with the repo', async () => {
    const user = userEvent.setup();
    const { onUpdatePr } = renderCell();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Update PR' }));
    expect(onUpdatePr).toHaveBeenCalledWith('101', { prNumber: '101', repo: 'owner/repo' }, { number: '101' });
  });

  test('buttons do nothing harmful without handlers', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <tr>
            <PrActionsCell pr={{ number: '101' }} repo="owner/repo" isFlagged={false} isInReview={false} isAcknowledged={false} />
          </tr>
        </tbody>
      </table>,
    );
    await user.click(screen.getByRole('button', { name: 'Ack PR #101' }));
    await user.click(screen.getByRole('button', { name: 'More actions for PR #101' }));
    await user.click(screen.getByRole('menuitem', { name: 'Update PR' }));
    await user.click(screen.getByRole('button', { name: 'More actions for PR #101' }));
    await user.click(screen.getByRole('menuitem', { name: 'View PR JSON details' }));
  });

  test('the More menu\'s View PR JSON details passes an entry with the repo', async () => {
    const user = userEvent.setup();
    const { onViewJson } = renderCell();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'View PR JSON details' }));
    expect(onViewJson).toHaveBeenCalledWith({ prNumber: '101', repo: 'owner/repo' }, { number: '101' });
  });

  test('the More menu lists the repo\'s labels the PR doesn\'t have, and applies one', async () => {
    const user = userEvent.setup();
    const { onApplyLabel } = renderCell({ pr: { number: '101', labels: ['bug'] } }, [{ name: 'bug' }, { name: 'docs' }, { name: 'ui' }]);
    const menu = await openMenu(user);
    const group = within(menu).getByRole('group', { name: 'Add label' });
    expect(within(group).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['docs', 'ui']);

    await user.click(within(group).getByRole('menuitem', { name: 'ui' }));
    expect(onApplyLabel).toHaveBeenCalledWith('101', 'ui', 'owner/repo');
  });

  test('with no repo labels, or no labels Provider, the Add label group says so', async () => {
    const user = userEvent.setup();
    renderCell();
    const menu = await openMenu(user);
    expect(within(menu).getByRole('group', { name: 'Add label' })).toHaveTextContent('No labels to add');
  });
});
