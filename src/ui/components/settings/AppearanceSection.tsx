import { useTheme } from '../../state/ThemeProvider';
import type { ThemePreference } from '../../helpers/theme.helpers.ts';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System (follows your computer)' },
];

/**
 * The Settings drawer's "Appearance": the page's theme. Saved as soon as
 * it changes (ThemeProvider), in user-defaults.json with a copy in the
 * browser.
 */
export function AppearanceSection() {
  const { preference, setPreference } = useTheme();
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
    </div>
  );
}
