import fs from 'fs';
import path from 'path';

// index.html links each stylesheet by hand, and a missing or misspelled
// link only shows as a 404 and an unstyled area - so check the links
// against the files.
const STYLES_DIR = __dirname;
const INDEX_HTML = path.join(STYLES_DIR, '..', 'index.html');

const linkedStylesheets = (html: string) =>
  [...html.matchAll(/<link\s[^>]*rel="stylesheet"[^>]*>/g)].map((match) => match[0].match(/href="([^"]+)"/)?.[1] ?? '');

describe('stylesheet links', () => {
  const links = linkedStylesheets(fs.readFileSync(INDEX_HTML, 'utf8'));

  test('every stylesheet in src/ui/styles is linked from index.html', () => {
    const files = fs.readdirSync(STYLES_DIR).filter((name) => name.endsWith('.css'));
    const unlinked = files.filter((name) => !links.includes(`./styles/${name}`));
    expect(unlinked).toEqual([]);
  });

  test('every stylesheet index.html links exists', () => {
    const missing = links.filter((href) => !fs.existsSync(path.join(STYLES_DIR, '..', href)));
    expect(missing).toEqual([]);
  });

  test('tokens.css is linked first, since the others use its variables', () => {
    expect(links[0]).toBe('./styles/tokens.css');
  });

  test('the check finds the links it is meant to check', () => {
    expect(links.length).toBeGreaterThan(1);
    expect(linkedStylesheets('<link rel="stylesheet" href="./styles/a.css" /><link rel="icon" href="x.png" />')).toEqual(['./styles/a.css']);
  });
});
