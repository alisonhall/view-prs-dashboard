import { usePrSectionPreferences } from '../../state/PrSectionPreferencesProvider';
import {
  BUILT_IN_SECTION_LOOKS,
  canChangePrSectionLook,
  PR_SECTION_CATALOG,
  sectionIconChoices,
} from '../../helpers/pr-section-preferences.helpers.ts';
import type { CustomSectionTone } from '../../helpers/pr-custom-sections.helpers.ts';
import { Button } from '../ui/Button';
import { IconAndColourFields } from './CustomSectionsSettings';

/**
 * Settings › Appearance's icons and colours for the built-in smart groups
 * (Flagged, In Review...), folded away under the Sections table: each one's
 * icon and colour, saved at once, and "Use the default" to put back its
 * own. The sections by status keep theirs, which match the status badges
 * on rows; a custom section's are chosen with it.
 */
export function SmartGroupLooks() {
  const { preferences, setSectionLook } = usePrSectionPreferences();
  const keys = PR_SECTION_CATALOG.filter((entry) => canChangePrSectionLook(entry.key));
  return (
    <details className="settings-looks">
      <summary>Icons and colours of the smart groups</summary>
      <p className="settings-hint">The sections by status keep theirs, which match the status badges on rows.</p>
      {keys.map(({ key, title }) => {
        const builtIn = BUILT_IN_SECTION_LOOKS[key];
        if (!builtIn) return null;
        const { icon, tone } = preferences[key] || {};
        return (
          <div key={key} className="settings-custom-section" role="group" aria-label={`${title}'s icon and colour`}>
            <span className="settings-looks-title">{title}</span>
            <IconAndColourFields
              idPrefix={`section-look-${key}`}
              icon={icon ?? builtIn.icon}
              tone={tone ?? builtIn.tone}
              iconChoices={sectionIconChoices(key)}
              onIcon={(next) => setSectionLook(key, { icon: next })}
              onTone={(next) => setSectionLook(key, { tone: next })}
            />
            <Button
              disabled={!icon && !tone}
              onClick={() => setSectionLook(key, { icon: builtIn.icon, tone: builtIn.tone as CustomSectionTone })}
            >
              Use the default
            </Button>
          </div>
        );
      })}
    </details>
  );
}
