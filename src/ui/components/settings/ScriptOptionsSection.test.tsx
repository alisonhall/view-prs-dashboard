/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStateProvider } from '../../state/FilterStateProvider';
import { RowFilterSelectionProvider } from '../../state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from '../../state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from '../../state/ChangeFilterActorSelectionProvider';
import { useFilterState } from '../../state/FilterStateContext';
import { ScriptOptionsSection } from './ScriptOptionsSection';

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
            <ScriptOptionsSection />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('ScriptOptionsSection', () => {
  test('every option is labelled, with its saved value', () => {
    renderSection();
    expect(screen.getByRole('textbox', { name: 'Repo (owner/name)' })).toHaveValue('');
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
    await user.type(screen.getByRole('textbox', { name: 'Repo (owner/name)' }), 'o/r');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Open mode' }), 'changed');
    await user.click(screen.getByRole('checkbox', { name: 'Ack all CHANGED non-draft PRs from this run' }));
    expect(values).toMatchObject({ repo: 'o/r', openMode: 'changed', ackChanged: true });
  });
});
