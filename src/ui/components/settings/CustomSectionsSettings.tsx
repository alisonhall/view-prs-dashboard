import { useEffect, useState, type FormEvent } from 'react';
import { usePrSectionPreferences } from '../../state/PrSectionPreferencesProvider';
import { useOptionalPrData } from '../../state/PrDataContext';
import { isPrSectionTitleTaken } from '../../helpers/pr-section-preferences.helpers.ts';
import {
  CUSTOM_SECTION_ICONS,
  customSectionKey,
  CUSTOM_SECTION_NAME_MAX_LENGTH,
  CUSTOM_SECTION_TONES,
  CUSTOM_SECTIONS_MAX,
  normalizeCustomSectionName,
  type CustomSection,
  type CustomSectionTone,
} from '../../helpers/pr-custom-sections.helpers.ts';
import type { PrDataPayload } from '../../types/pr-data.ts';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';

// How many PRs are in a custom section, for the question before deleting it.
const countPrsIn = (customSectionsByRepo: PrDataPayload['customSectionsByRepo'], id: string) =>
  Object.values(customSectionsByRepo || {}).reduce(
    (total, perRepo) => total + Object.values(perRepo || {}).filter((ids) => ids.includes(id)).length,
    0,
  );

// A section's icon and colour, with how its header will show them; also
// the built-in smart groups' (SmartGroupLooks), with their icon choices.
export function IconAndColourFields({
  idPrefix,
  icon,
  tone,
  onIcon,
  onTone,
  iconChoices = CUSTOM_SECTION_ICONS,
}: {
  idPrefix: string;
  icon: IconName;
  tone: string;
  onIcon: (icon: IconName) => void;
  onTone: (tone: CustomSectionTone) => void;
  iconChoices?: ReadonlyArray<{ icon: IconName; label: string }>;
}) {
  return (
    <>
      <div className="settings-field">
        <label htmlFor={`${idPrefix}-icon`}>Icon</label>
        <select id={`${idPrefix}-icon`} value={icon} onChange={(event) => onIcon(event.target.value as IconName)}>
          {iconChoices.map((option) => (
            <option key={option.icon} value={option.icon}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-field">
        <label htmlFor={`${idPrefix}-tone`}>Colour</label>
        <select id={`${idPrefix}-tone`} value={tone} onChange={(event) => onTone(event.target.value as CustomSectionTone)}>
          {CUSTOM_SECTION_TONES.map((option) => (
            <option key={option.tone} value={option.tone}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {/* How the section's header will show them. */}
      <span className="pr-section-icon settings-custom-section-preview" data-tone={tone} aria-hidden="true">
        <Icon name={icon} />
      </span>
    </>
  );
}

// What's wrong with a name another section already has, for under its box.
const takenMessage = (name: string) => `There's already a section called "${normalizeCustomSectionName(name)}".`;

function CustomSectionRow({ section, prCount }: { section: CustomSection; prCount: number }) {
  const { updateCustomSection, removeCustomSection, catalog } = usePrSectionPreferences();
  const [name, setName] = useState(section.name);
  useEffect(() => setName(section.name), [section.name]);
  const idPrefix = `custom-section-${section.id}`;
  const isTaken = isPrSectionTitleTaken(name, catalog, customSectionKey(section.id));
  // An emptied name, or one another section has, goes back to the saved one
  // (the message under the box says why until it's changed).
  const [refused, setRefused] = useState('');
  // Enter then leaving the box commits twice: the second, with the name
  // back as it was, has nothing to save and keeps the message.
  const commitName = () => {
    const next = normalizeCustomSectionName(name);
    if (next === section.name) {
      setName(section.name);
    } else if (next && !isTaken) {
      updateCustomSection(section.id, { name: next });
      setRefused('');
    } else {
      setName(section.name);
      setRefused(next ? takenMessage(next) : '');
    }
  };
  const remove = () => {
    const prs = prCount === 1 ? 'Its 1 PR is taken out of it.' : prCount > 1 ? `Its ${prCount} PRs are taken out of it.` : '';
    if (window.confirm(`Delete the section "${section.name}"? ${prs}`.trim())) removeCustomSection(section.id);
  };
  return (
    <div className="settings-custom-section" role="group" aria-label={section.name}>
      <div className="settings-field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={name}
          maxLength={CUSTOM_SECTION_NAME_MAX_LENGTH}
          aria-invalid={isTaken || undefined}
          aria-describedby={isTaken || refused ? `${idPrefix}-name-error` : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setRefused('');
          }}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitName();
          }}
        />
        {(isTaken || refused) && (
          <span id={`${idPrefix}-name-error`} className="settings-field-error">
            {isTaken ? takenMessage(name) : refused}
          </span>
        )}
      </div>
      <IconAndColourFields
        idPrefix={idPrefix}
        icon={section.icon}
        tone={section.tone}
        onIcon={(icon) => updateCustomSection(section.id, { icon })}
        onTone={(tone) => updateCustomSection(section.id, { tone })}
      />
      <Button onClick={remove}>Delete {section.name}</Button>
    </div>
  );
}

/**
 * Settings › Appearance's custom sections: each one's name, icon and
 * colour, changed in place and saved at once (a name when you leave its
 * box or press Enter), with a Delete; and a form for a new one. They're
 * shown, opened and ordered in the Sections table above, with the smart
 * groups; PRs go in them from each PR's More actions.
 */
export function CustomSectionsSettings() {
  const { customSections, addCustomSection, catalog } = usePrSectionPreferences();
  const customSectionsByRepo = useOptionalPrData()?.payload?.customSectionsByRepo;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('tag');
  const [tone, setTone] = useState<CustomSectionTone>('accent');
  const isFull = customSections.length >= CUSTOM_SECTIONS_MAX;
  const isTaken = isPrSectionTitleTaken(name, catalog);
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (addCustomSection({ name, icon, tone })) setName('');
  };
  return (
    <div className="settings-group">
      <h3 className="settings-heading" id="settings-custom-sections-heading">
        Custom sections
      </h3>
      <p className="settings-hint">
        Sections you put PRs in yourself, from each PR&apos;s More actions. They&apos;re listed with the smart groups, and shown, opened and
        moved in the table above.
      </p>
      {customSections.map((section) => (
        <CustomSectionRow key={section.id} section={section} prCount={countPrsIn(customSectionsByRepo, section.id)} />
      ))}
      <form className="settings-custom-section" aria-label="New custom section" onSubmit={add}>
        <div className="settings-field">
          <label htmlFor="custom-section-new-name">New section&apos;s name</label>
          <input
            id="custom-section-new-name"
            type="text"
            value={name}
            maxLength={CUSTOM_SECTION_NAME_MAX_LENGTH}
            disabled={isFull}
            aria-invalid={isTaken || undefined}
            aria-describedby={isTaken ? 'custom-section-new-name-error' : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {isTaken && (
            <span id="custom-section-new-name-error" className="settings-field-error">
              {takenMessage(name)}
            </span>
          )}
        </div>
        <IconAndColourFields idPrefix="custom-section-new" icon={icon} tone={tone} onIcon={setIcon} onTone={setTone} />
        <Button type="submit" disabled={isFull || isTaken || !normalizeCustomSectionName(name)}>
          Add section
        </Button>
      </form>
      {isFull && <p className="settings-hint">That&apos;s the most there can be ({CUSTOM_SECTIONS_MAX}).</p>}
    </div>
  );
}
