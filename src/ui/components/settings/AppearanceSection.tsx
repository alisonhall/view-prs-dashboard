import { useTheme } from '../../state/ThemeProvider';
import { usePrSectionPreferences } from '../../state/PrSectionPreferencesProvider';
import type { ThemePreference } from '../../helpers/theme.helpers.ts';
import {
  isDefaultPrSectionOrder,
  isPrSectionHidden,
  prSectionDefaultOpen,
  prSectionKind,
  prSectionStartsOpen,
  type PrSectionKind,
} from '../../helpers/pr-section-preferences.helpers.ts';
import { Button, IconButton } from '../ui/Button';
import { CustomSectionsSettings } from './CustomSectionsSettings';

const SECTION_KINDS: ReadonlyArray<{ kind: PrSectionKind; heading: string }> = [
  { kind: 'smart', heading: 'Smart groups' },
  { kind: 'status', heading: 'By status' },
];

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System (follows your computer)' },
];

/**
 * The Settings drawer's "Appearance": the page's theme, which PR table
 * sections show and start open and their order (each kind among its own,
 * under the same headings as the page), and whether rows are grouped by
 * repo; and the custom sections (CustomSectionsSettings). Each is saved as soon as it changes
 * (ThemeProvider, PrSectionPreferencesProvider), in user-defaults.json.
 */
export function AppearanceSection() {
  const { preference, setPreference } = useTheme();
  const {
    preferences,
    setSectionHidden,
    setSectionStartsOpen,
    sectionOrder,
    moveSection,
    resetSections,
    groupByRepo,
    setGroupByRepo,
    catalog,
  } = usePrSectionPreferences();
  // Every section, the custom ones included.
  const titleOf = (key: string) => catalog.find((entry) => entry.key === key)?.title ?? key;
  const kindOf = (key: string) => prSectionKind(key, catalog);
  // A move that takes a section to the end of its kind disables the button
  // just pressed, so focus goes to the row's other one.
  const move = (key: string, offset: -1 | 1, button: HTMLButtonElement) => {
    const kindKeys = sectionOrder.filter((sectionKey) => kindOf(sectionKey) === kindOf(key));
    const target = kindKeys.indexOf(key) + offset;
    moveSection(key, offset);
    if (target === 0 || target === kindKeys.length - 1) {
      const row = button.closest('tr');
      requestAnimationFrame(() => row?.querySelector<HTMLButtonElement>(`[data-move="${offset < 0 ? 'down' : 'up'}"]`)?.focus());
    }
  };
  return (
    <div className="settings-section">
      <fieldset className="settings-group settings-fieldset">
        <legend className="settings-heading">Theme</legend>
        {OPTIONS.map(({ value, label }) => (
          <label key={value} className="settings-check">
            <input type="radio" name="theme" value={value} checked={preference === value} onChange={() => setPreference(value)} />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="settings-group">
        <h3 className="settings-heading" id="settings-sections-heading">
          Sections
        </h3>
        <p className="settings-hint">
          Which of the PR table&apos;s sections show, which are open when the page loads, and their order. The smart groups come before the
          sections by status, and each is ordered among its own kind.
        </p>
        <table className="settings-sections-table" aria-labelledby="settings-sections-heading">
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col">Show</th>
              <th scope="col">Open on page load</th>
              <th scope="col">Order</th>
            </tr>
          </thead>
          {SECTION_KINDS.map(({ kind, heading }) => {
            const kindKeys = sectionOrder.filter((key) => kindOf(key) === kind);
            return (
              <tbody key={kind}>
                <tr className="settings-sections-kind">
                  <th scope="rowgroup" colSpan={4}>
                    {heading}
                  </th>
                </tr>
                {kindKeys.map((key, index) => {
                  const title = titleOf(key);
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
                          checked={prSectionStartsOpen(preferences, key, prSectionDefaultOpen(key, catalog))}
                          disabled={hidden}
                          onChange={(event) => setSectionStartsOpen(key, event.target.checked)}
                        />
                      </td>
                      <td>
                        <span className="settings-sections-order">
                          <IconButton
                            icon="chevronUp"
                            label={`Move ${title} up`}
                            data-move="up"
                            disabled={index === 0}
                            onClick={(event) => move(key, -1, event.currentTarget)}
                          />
                          <IconButton
                            icon="chevronDown"
                            label={`Move ${title} down`}
                            data-move="down"
                            disabled={index === kindKeys.length - 1}
                            onClick={(event) => move(key, 1, event.currentTarget)}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
        <div className="settings-actions">
          {/* Only show/open/order choices: a section's sort isn't one of these. */}
          <Button
            onClick={resetSections}
            disabled={
              isDefaultPrSectionOrder(sectionOrder, catalog) &&
              !Object.values(preferences).some((preference) => preference.hidden || preference.open !== undefined)
            }
          >
            Restore default sections
          </Button>
        </div>
      </div>

      <CustomSectionsSettings />

      <div className="settings-group">
        <h3 className="settings-heading">Rows</h3>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={groupByRepo}
            aria-describedby="group-by-repo-hint"
            onChange={(event) => setGroupByRepo(event.target.checked)}
          />
          Group rows by repo (in a section with PRs from more than one)
        </label>
        <p className="settings-hint" id="group-by-repo-hint">
          A section&apos;s rows are listed repo by repo, under each repo&apos;s name, instead of all together.
        </p>
      </div>
    </div>
  );
}
