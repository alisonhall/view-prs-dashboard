import type { PrStory } from "../types/pr-data.ts";

// A story row as the Notes editor holds it: both fields always strings.
export interface StoryRow {
  name: string;
  url: string;
}

// The notes' stories as the rows the Stories field shows, rows with neither
// a name nor a URL dropped, always with at least one (possibly empty) row.
const normalizeStoriesForUi = (value: PrStory[] | null | undefined): StoryRow[] => {
  const rows = (Array.isArray(value) ? value : [])
    .map((story) => ({ name: String(story?.name ?? ""), url: String(story?.url ?? "") }))
    .filter((story) => story.name.length > 0 || story.url.length > 0);
  return rows.length ? rows : [{ name: "", url: "" }];
};

export interface PrNotesHelpers {
  normalizeStoriesForUi: typeof normalizeStoriesForUi;
}

const createPrNotesHelpers = (): PrNotesHelpers => ({
  normalizeStoriesForUi,
});

export { createPrNotesHelpers };
