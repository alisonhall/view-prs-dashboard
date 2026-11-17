import { useCallback, useMemo, useRef, useState } from 'react';
import type { PrEntry } from '../types/pr-data.ts';
import { buildPrEntryKey } from '../helpers/pr-entry-keys.helpers.ts';
import { holdRowOrder } from '../helpers/pr-section-sort.helpers.ts';

interface OrderedSection {
  key: string;
  prs: PrEntry[];
}

interface ShownOrder {
  // The section's sort (and grouping) when it was shown: a new one applies
  // at once.
  sortKey: string;
  keys: string[];
}

/**
 * Keeps a section's rows where they are while you're working in it (the
 * pointer or keyboard focus in it, reported through `setSectionInteracting`,
 * or its row selected: `selectedSectionKeys`), so a refresh that re-sorts
 * them - by "Last updated", say - doesn't move a row away from under you.
 * New rows still go where the sort puts them (holdRowOrder). Once you leave
 * the section, its sort applies again.
 *
 * `orderChangedKeys` are the held sections whose sort would order their
 * rows differently, for the table's "Re-sort"; `resortSection` applies the
 * sort to one (and holds that order).
 *
 * `sortKeyOf` says what each section's sorted by, so changing it isn't held.
 *
 * Starting or stopping work in a section doesn't re-render: a held order
 * is the sorted one until a refresh changes it, so only leaving a section
 * whose order changed needs one.
 */
export function useHeldSectionOrder<S extends OrderedSection>(
  sortedSections: S[],
  selectedSectionKeys: ReadonlySet<string>,
  sortKeyOf: (section: S) => string,
  defaultRepo: string,
) {
  const shownRef = useRef(new Map<string, ShownOrder>());
  const interactingRef = useRef(new Set<string>());
  const orderChangedRef = useRef(new Set<string>());
  // Bumped to show a section in its sort: "Re-sort", or leaving it.
  const [version, setVersion] = useState(0);

  const result = useMemo(() => {
    void version;
    const keyOf = (entry: PrEntry | undefined) => buildPrEntryKey(entry?.repo || defaultRepo, entry?.data?.number ?? entry?.prNumber ?? '');
    const orderChangedKeys = new Set<string>();
    const sections = sortedSections.map((section) => {
      const sortKey = sortKeyOf(section);
      const shown = shownRef.current.get(section.key);
      const held = selectedSectionKeys.has(section.key) || interactingRef.current.has(section.key);
      const prs = held && shown && shown.sortKey === sortKey ? holdRowOrder(section.prs, shown.keys, keyOf) : section.prs;
      const keys = prs.map(keyOf);
      if (prs !== section.prs && keys.some((key, index) => key !== keyOf(section.prs[index]))) orderChangedKeys.add(section.key);
      shownRef.current.set(section.key, { sortKey, keys });
      return prs === section.prs ? section : { ...section, prs };
    });
    orderChangedRef.current = orderChangedKeys;
    return { sections, orderChangedKeys };
  }, [sortedSections, selectedSectionKeys, sortKeyOf, defaultRepo, version]);

  const resortSection = useCallback((sectionKey: string) => {
    shownRef.current.delete(sectionKey);
    setVersion((count) => count + 1);
  }, []);

  const setSectionInteracting = useCallback((sectionKey: string, interacting: boolean) => {
    if (interacting) {
      interactingRef.current.add(sectionKey);
    } else {
      interactingRef.current.delete(sectionKey);
      if (orderChangedRef.current.has(sectionKey)) setVersion((count) => count + 1);
    }
  }, []);

  return { ...result, resortSection, setSectionInteracting };
}
