import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createFetchWithTimeout } from '../helpers/fetch-with-timeout.helpers.ts';
import { archivedCount, mergeArchivedRows, type ArchivedSection } from '../helpers/pr-archive.helpers.ts';
import type { ArchiveSummary, PrEntry } from '../types/pr-data.ts';
import { PrDataContext, usePrData, type PrDataValue } from './PrDataContext.tsx';

/**
 * The archived PRs: merged and closed ones past the archive cutoff, which
 * the script moves to the archive file and /data goes without. Fetched
 * (GET /view-prs/archive) the first time a view needs them - the table's
 * "Show older", Review stats reaching back past the cutoff, Authors - and
 * kept until the page reloads; fetched again when the payload's
 * archiveSummary version moves (a run archived more, or their notes
 * changed). <WithArchivedRows> gives the views under it a payload with
 * them added, so those views read them as any other row.
 */
export type ArchiveStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface PrArchiveValue {
  summary: ArchiveSummary | undefined;
  status: ArchiveStatus;
  rows: Record<string, PrEntry> | null;
  // Fetches them unless they're here (or on their way) for this version.
  load: () => void;
  // The table's Closed and Merged sections showing their archived PRs.
  shownSections: ReadonlySet<ArchivedSection>;
  showSection: (section: ArchivedSection) => void;
}

const PrArchiveContext = createContext<PrArchiveValue | null>(null);

const fetchWithTimeout = createFetchWithTimeout((input, init) => fetch(input, init));
const NO_SECTIONS: ReadonlySet<ArchivedSection> = new Set();

export function PrArchiveProvider({ children }: { children: ReactNode }) {
  const { payload } = usePrData();
  const summary = payload?.archiveSummary;
  const version = String(summary?.version || '');
  const [state, setState] = useState<{ status: ArchiveStatus; rows: Record<string, PrEntry> | null; forVersion: string }>({
    status: 'idle',
    rows: null,
    forVersion: '',
  });
  const [shownSections, setShownSections] = useState<ReadonlySet<ArchivedSection>>(NO_SECTIONS);
  // The version last fetched (or being fetched), and whether that failed:
  // a version is fetched once, unless asked again after a failure (load).
  const attempted = useRef<{ version: string; failed: boolean } | null>(null);
  const latest = useRef({ version, count: archivedCount(summary) });
  latest.current = { version, count: archivedCount(summary) };

  const fetchArchive = useCallback((forVersion: string) => {
    attempted.current = { version: forVersion, failed: false };
    setState((previous) => ({ ...previous, status: previous.rows ? previous.status : 'loading' }));
    fetchWithTimeout('/view-prs/archive')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${response.status}`);
        return (body?.byPrNumber || {}) as Record<string, PrEntry>;
      })
      .then((rows) => {
        // A newer fetch has started since: its answer is the one kept.
        if (attempted.current?.version !== forVersion) return;
        setState({ status: 'loaded', rows, forVersion });
      })
      .catch(() => {
        if (attempted.current?.version !== forVersion) return;
        attempted.current = { version: forVersion, failed: true };
        // Rows from an earlier version stay (a failed refresh), marked failed.
        setState((previous) => ({ ...previous, status: 'failed' }));
      });
  }, []);

  // The same function throughout (it reads the latest version from a ref),
  // so a view asking for them on each render doesn't fetch again.
  const load = useCallback(() => {
    const { version: current, count } = latest.current;
    if (count === 0 && attempted.current === null) return;
    if (attempted.current?.version === current && !attempted.current.failed) return;
    fetchArchive(current);
  }, [fetchArchive]);

  // Once fetched, fetched again when they change (more archived, or their
  // notes changed).
  useEffect(() => {
    if (attempted.current !== null && attempted.current.version !== version) fetchArchive(version);
  }, [version, fetchArchive]);

  const showSection = useCallback(
    (section: ArchivedSection) => {
      setShownSections((previous) => (previous.has(section) ? previous : new Set([...previous, section])));
      load();
    },
    [load],
  );

  const value = useMemo<PrArchiveValue>(
    () => ({ summary, status: state.status, rows: state.rows, load, shownSections, showSection }),
    [summary, state.status, state.rows, load, shownSections, showSection],
  );
  return <PrArchiveContext.Provider value={value}>{children}</PrArchiveContext.Provider>;
}

// Without a provider (a view rendered on its own): no archive.
const NO_ARCHIVE: PrArchiveValue = {
  summary: undefined,
  status: 'idle',
  rows: null,
  load: () => {},
  shownSections: NO_SECTIONS,
  showSection: () => {},
};

export function usePrArchive(): PrArchiveValue {
  return useContext(PrArchiveContext) || NO_ARCHIVE;
}

/**
 * The views under it get the payload with the archived PRs added: all of
 * them, or those of `sections`. Fetches them when `include` (and there are
 * any); until they're here, the payload as it is.
 */
export function WithArchivedRows({
  include,
  sections,
  children,
}: {
  include: boolean;
  sections?: ReadonlySet<string>;
  children: ReactNode;
}) {
  const data = useContext(PrDataContext);
  const { rows, load, summary } = usePrArchive();
  // Asked again when the count moves: a view shown before the data arrived
  // (nothing counted yet), or before anything was archived, gets them once
  // there are some.
  const count = archivedCount(summary);
  useEffect(() => {
    if (include) load();
  }, [include, load, count]);
  const payload = data?.payload;
  const merged = useMemo(
    () => (include && payload ? mergeArchivedRows(payload, rows, sections) : payload),
    [include, payload, rows, sections],
  );
  const value = useMemo<PrDataValue | null>(
    () => (data && merged !== data.payload ? { ...data, payload: merged! } : data),
    [data, merged],
  );
  if (!value) return <>{children}</>;
  return <PrDataContext.Provider value={value}>{children}</PrDataContext.Provider>;
}
