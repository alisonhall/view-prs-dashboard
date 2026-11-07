/**
 * AuthorInsightsSelector - the Authors view's "Author" picker: a ComboBox
 * that narrows the authors to what's typed, those with a PR updated in
 * the last 30 days first (newest first), then everyone else by name
 * (useAuthorPickerOptions). Each has their avatar, and their login when
 * it isn't their name.
 *
 * It decides which author is selected: when the selected one isn't among
 * the options (none chosen yet, or gone from the data), the effect below
 * picks the first - the author of the most recently updated PR - and
 * with no options it clears the selection. Each setSelectedAuthorLogin is guarded on the value
 * changing, so the effect settles. With no stored PRs, or no authors, it
 * says so instead of showing the picker.
 *
 * @module components/AuthorInsightsSelector
 */

import { useEffect } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorPickerOptions } from '../state/useAuthorPickerOptions';
import { resolveValidAuthorLogin, type AuthorOption } from '../helpers/pr-author-insights-display.helpers.ts';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.ts';
import { Avatar } from './ui/Avatar';
import { ComboBox, type ComboBoxOption } from './ui/ComboBox';

const { getUserInitials } = createPrUserInitialsHelpers();

export function AuthorInsightsSelector() {
  const { selectedAuthorLogin, setSelectedAuthorLogin } = usePrData();
  const { getEffectiveViewerLogin } = useActorIdentity();
  const { rowCount, recent, others, options } = useAuthorPickerOptions();

  useEffect(() => {
    const validatedLogin = resolveValidAuthorLogin(options, selectedAuthorLogin);
    if (validatedLogin !== selectedAuthorLogin) {
      setSelectedAuthorLogin(validatedLogin);
    }
  }, [options, selectedAuthorLogin, setSelectedAuthorLogin]);

  if (!rowCount) {
    return <p className="stats-empty">No local rows available for author insights.</p>;
  }
  if (!options.length) {
    return <p className="stats-empty">No authors found in the current local data scope.</p>;
  }

  const viewerLogin = String(getEffectiveViewerLogin({}) || '').toLowerCase();
  const toOption = ({ login, name }: AuthorOption): ComboBoxOption => {
    const label = name || login;
    return {
      value: login,
      label,
      detail: label !== login ? login : undefined,
      leading: (
        <Avatar
          initials={getUserInitials(label, login)}
          login={login}
          isViewer={Boolean(viewerLogin) && login.toLowerCase() === viewerLogin}
          size="sm"
        />
      ),
    };
  };

  return (
    <div className="ui-toolbar author-insights-controls">
      <ComboBox
        id="author-insights-select"
        label="Author"
        className="author-insights-label"
        groups={[
          { label: 'Recent PRs', options: recent.map(toOption) },
          { label: 'Everyone else', options: others.map(toOption) },
        ]}
        value={selectedAuthorLogin || ''}
        onChange={setSelectedAuthorLogin}
        noMatchesText="No authors match"
      />
    </div>
  );
}
