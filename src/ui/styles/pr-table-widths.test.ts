import fs from 'fs';
import path from 'path';

// pr-table.css decides with container queries whether a section's table
// fits the list (then its column headers stick) or scrolls sideways. CSS
// can't use a variable in a container query, so the widths there repeat
// .pr-table's min-widths plus the section's two 1px borders. This keeps
// them in step: a mismatch would make the column headers stick inside a
// scroll box, over the first row.
const css = fs.readFileSync(path.join(__dirname, 'pr-table.css'), 'utf8');
const SECTION_BORDERS = 2;

const minWidth = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{[^}]*?min-width:\\s*(\\d+)px`).exec(css);
  if (!match) throw new Error(`no min-width for ${selector}`);
  return Number(match[1]);
};

const containerWidths = (kind: 'min' | 'max') =>
  [...css.matchAll(new RegExp(`@container \\(${kind}-width:\\s*(\\d+)px\\)`, 'g'))].map((match) => Number(match[1]));

describe('pr-table.css container query widths', () => {
  const full = minWidth('.pr-table') + SECTION_BORDERS;
  const docked = minWidth('.pr-workspace[data-pane="docked"] .pr-table') + SECTION_BORDERS;

  test("the sideways scrolling starts at the table's min-widths plus the borders", () => {
    expect(containerWidths('max').sort()).toEqual([docked, full].sort());
  });

  test('the column headers stick just above those widths', () => {
    expect(containerWidths('min').sort()).toEqual([docked + 1, full + 1].sort());
  });

  test('reads the widths it is meant to', () => {
    expect(full).toBe(902);
    expect(docked).toBe(742);
  });
});
