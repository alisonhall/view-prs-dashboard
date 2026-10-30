import { describeLastUpdate, describeRepos } from './pr-app-header.helpers.ts';

const NOW = Date.parse('2026-01-10T12:00:00Z');

describe('describeLastUpdate', () => {
  test('says how long ago, in the largest whole unit', () => {
    expect(describeLastUpdate('2026-01-10T11:59:30Z', NOW).label).toBe('Updated just now');
    expect(describeLastUpdate('2026-01-10T11:55:00Z', NOW).label).toBe('Updated 5m ago');
    expect(describeLastUpdate('2026-01-10T09:00:00Z', NOW).label).toBe('Updated 3h ago');
    expect(describeLastUpdate('2026-01-07T12:00:00Z', NOW).label).toBe('Updated 3d ago');
  });

  test('gives the exact time for the tooltip, and marks a day or more as stale', () => {
    const recent = describeLastUpdate('2026-01-10T09:00:00Z', NOW);
    expect(recent.title).toMatch(/^Last updated /);
    expect(recent.isStale).toBe(false);
    expect(describeLastUpdate('2026-01-09T12:00:00Z', NOW).isStale).toBe(true);
  });

  test('without a time ("-", empty, unparseable) it was not updated yet', () => {
    for (const value of [undefined, '', '-', 'soon']) {
      expect(describeLastUpdate(value, NOW)).toEqual({ label: 'Not updated yet', title: '', isStale: false });
    }
  });

  test('a time in the future (clock skew) is "just now"', () => {
    expect(describeLastUpdate('2026-01-10T12:05:00Z', NOW).label).toBe('Updated just now');
  });
});

describe('describeRepos', () => {
  test('one repo by name; several as a count with the list for the tooltip', () => {
    expect(describeRepos([{ repo: 'o/a' }, { repo: 'o/a' }])).toEqual({ label: 'o/a', title: '' });
    expect(describeRepos([{ repo: 'o/b' }, { repo: 'o/a' }, { repo: ' o/b ' }])).toEqual({ label: '2 repos', title: 'o/a, o/b' });
  });

  test('without rows naming one, the repo being run', () => {
    expect(describeRepos([], 'o/run')).toEqual({ label: 'o/run', title: '' });
    expect(describeRepos([{ repo: '' }, {}], ' o/run ')).toEqual({ label: 'o/run', title: '' });
    expect(describeRepos([])).toEqual({ label: '', title: '' });
  });
});
