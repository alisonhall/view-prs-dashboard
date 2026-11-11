import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_STATS_COLUMN_CATALOG } from './review-stats-columns.helpers';
import { REVIEW_STATS_CARD_EXPLANATIONS, REVIEW_STATS_COLUMN_EXPLANATIONS } from './review-stats-explanations.helpers';

const readme = readFileSync(join(__dirname, '..', '..', '..', 'README.md'), 'utf8');

describe('review-stats-explanations.helpers', () => {
  test('every column has an explanation, and the catalog takes it from here', () => {
    REVIEW_STATS_COLUMN_CATALOG.forEach(({ key, explanation }) => {
      expect(explanation).toBe(REVIEW_STATS_COLUMN_EXPLANATIONS[key as keyof typeof REVIEW_STATS_COLUMN_EXPLANATIONS]);
    });
    expect(Object.keys(REVIEW_STATS_COLUMN_EXPLANATIONS)).toEqual(['reviewer', ...REVIEW_STATS_COLUMN_CATALOG.map(({ key }) => key)]);
  });

  test("the README's How Review stats counts repeats each one word for word", () => {
    const section = readme.slice(readme.indexOf('**How Review stats counts.**'));
    expect(section.length).toBeLessThan(readme.length);
    for (const text of [...Object.values(REVIEW_STATS_CARD_EXPLANATIONS), ...Object.values(REVIEW_STATS_COLUMN_EXPLANATIONS)]) {
      expect(section).toContain(text);
    }
  });
});
