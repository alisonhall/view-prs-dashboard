/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStateProvider } from '../../state/FilterStateProvider';
import { RowFilterSelectionProvider } from '../../state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from '../../state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from '../../state/ChangeFilterActorSelectionProvider';
import { useFilterState } from '../../state/FilterStateContext';
import { ScriptOptions } from './ScriptOptions';

let values: Record<string, unknown> = {};
function Probe() {
  values = useFilterState().values;
  return null;
}

const renderSection = () =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ repo: '', limit: '', mergedLimit: '', jobs: '', openMode: 'none', ackChanged: false, showReason: true, quiet: false }}>
            <Probe />
            <ScriptOptions />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('ScriptOptions', () => {
  test('every option is labelled, with its saved value', () => {
    renderSection();
    expect(screen.getByRole('combobox', { name: 'Repo (owner/name)' })).toHaveValue('');
    for (const name of ['Open PR limit', 'Merged PR limit', 'Parallel jobs']) {
      expect(screen.getByRole('spinbutton', { name })).toHaveAttribute('min', '1');
    }
    expect(screen.getByRole('combobox', { name: 'Open mode' })).toHaveValue('none');
    expect(screen.getByRole('checkbox', { name: 'Show CHANGED reason in status' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Quiet mode (hide run metadata header)' })).not.toBeChecked();
  });

  test('changing one sets its FilterStateContext key', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.type(screen.getByRole('combobox', { name: 'Repo (owner/name)' }), 'o/r');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Open mode' }), 'changed');
    await user.click(screen.getByRole('checkbox', { name: 'Ack all CHANGED non-draft PRs from this run' }));
    expect(values).toMatchObject({ repo: 'o/r', openMode: 'changed', ackChanged: true });
  });

  test('every option says what it does, as its description', () => {
    renderSection();
    expect(screen.getByRole('combobox', { name: 'Repo (owner/name)' })).toHaveAccessibleDescription(/VIEW_PRS_REPO/);
    expect(screen.getByRole('spinbutton', { name: 'Open PR limit' })).toHaveAccessibleDescription(/Empty: 200/);
    expect(screen.getByRole('spinbutton', { name: 'Merged PR limit' })).toHaveAccessibleDescription(/7 most recent days/);
    expect(screen.getByRole('spinbutton', { name: 'Parallel jobs' })).toHaveAccessibleDescription(/Empty: 6/);
    expect(screen.getByRole('combobox', { name: 'Open mode' })).toHaveAccessibleDescription(/opens in a browser/);
    for (const name of ['Ack all CHANGED non-draft PRs from this run', 'Show CHANGED reason in status', 'Quiet mode (hide run metadata header)']) {
      expect(screen.getByRole('checkbox', { name }).getAttribute('aria-describedby')).toBeTruthy();
      expect(screen.getByRole('checkbox', { name })).not.toHaveAccessibleDescription('');
    }
  });
});
