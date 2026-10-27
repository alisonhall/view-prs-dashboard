import { useTheme } from '../../state/ThemeProvider';
import { usePrSectionPreferences } from '../../state/PrSectionPreferencesProvider';
import type { ThemePreference } from '../../helpers/theme.helpers.ts';
import {
  isPrSectionHidden,
  PR_SECTION_CATALOG,
  prSectionStartsOpen,
} from '../../helpers/pr-section-preferences.helpers.ts';
import { Button } from '../ui/Button';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System (follows your computer)' },
];

/**
 * The Settings drawer's "Appearance": the page's theme, and which PR table
 * sections show and start open. Each is saved as soon as it changes
 * (ThemeProvider, PrSectionPreferencesProvider), in user-defaults.json.
 */
export function AppearanceSection() {
  const { preference, setPreference } = useTheme();
  const { preferences, setSectionHidden, setSectionStartsOpen, resetSections } = usePrSectionPreferences();
  return (
    <div className="settings-section">
      <fieldset className="settings-group settings-fieldset">
        <legend className="settings-heading">Theme</legend>
        {OPTIONS.map(({ value, label }) => (
          <label key={value} className="settings-check">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setPreference(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="settings-group">
        <h3 className="settings-heading" id="settings-sections-heading">
          Sections
        </h3>
        <table className="settings-sections-table" aria-labelledby="settings-sections-heading">
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col">Show</th>
              <th scope="col">Open on page load</th>
            </tr>
          </thead>
          <tbody>
            {PR_SECTION_CATALOG.map(({ key, title }) => {
              const hidden = isPrSectionHidden(preferences, key);
              return (
                <tr key={key}>
                  <th scope="row">{title}</th>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Show ${title}`}
                      checked={!hidden}
                      onChange={(event) => setSectionHidden(key, !event.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Open ${title} when the page loads`}
                      checked={prSectionStartsOpen(preferences, key)}
                      disabled={hidden}
                      onChange={(event) => setSectionStartsOpen(key, event.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="settings-actions">
          <Button onClick={resetSections} disabled={Object.keys(preferences).length === 0}>
            Restore default sections
          </Button>
        </div>
      </div>
    </div>
  );
}
