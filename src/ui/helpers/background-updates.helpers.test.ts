import {
  boostedPriorities,
  formatMinutes,
  normalizeSchedulerRepoConfig,
  parseMinutes,
  parsePriorityBoost,
  withoutRepo,
  withRepoSetting,
} from './background-updates.helpers';

describe('background updates settings', () => {
  test('reads only repo objects from a saved config', () => {
    expect(normalizeSchedulerRepoConfig(undefined)).toEqual({});
    expect(normalizeSchedulerRepoConfig(['a'])).toEqual({});
    expect(normalizeSchedulerRepoConfig({ 'a/b': { priority: 2 }, 'c/d': 5, 'e/f': null })).toEqual({ 'a/b': { priority: 2 } });
  });

  test('shows intervals in minutes', () => {
    expect(formatMinutes(120000)).toBe('2');
    expect(formatMinutes(90000)).toBe('1.5');
    expect(formatMinutes(15 * 60000)).toBe('15');
  });

  test.each([
    ['', { kind: 'empty' }],
    ['  ', { kind: 'empty' }],
    ['2', { kind: 'value', value: 120000 }],
    ['1.5', { kind: 'value', value: 90000 }],
    ['0.5', { kind: 'error', message: 'At least 1 minute.' }],
    ['soon', { kind: 'error', message: 'Enter a number of minutes.' }],
  ])('reads %p minutes', (text, expected) => {
    expect(parseMinutes(text)).toEqual(expected);
  });

  test.each([
    ['', { kind: 'empty' }],
    ['3', { kind: 'value', value: 3 }],
    ['-2', { kind: 'value', value: -2 }],
    ['1.5', { kind: 'error', message: 'A whole number from -10 to 10.' }],
    ['11', { kind: 'error', message: 'A whole number from -10 to 10.' }],
    ['high', { kind: 'error', message: 'A whole number from -10 to 10.' }],
  ])('reads a %p priority boost', (text, expected) => {
    expect(parsePriorityBoost(text)).toEqual(expected);
  });

  test('a changed setting keeps the rest of the config, and other keys of the repo', () => {
    const config = { 'a/b': { priority: 2, note: 'kept' }, 'c/d': { quickCheckIntervalMs: 60000 } };
    expect(withRepoSetting(config, 'a/b', 'autoRefreshIntervalMs', 600000)).toEqual({
      'a/b': { priority: 2, note: 'kept', autoRefreshIntervalMs: 600000 },
      'c/d': { quickCheckIntervalMs: 60000 },
    });
    expect(withRepoSetting(config, 'e/f', 'priority', -1)).toEqual({ ...config, 'e/f': { priority: -1 } });
  });

  test('a setting back to its default is removed, and a repo left with nothing is dropped', () => {
    const config = { 'a/b': { priority: 2 }, 'c/d': { quickCheckIntervalMs: 60000 } };
    expect(withRepoSetting(config, 'a/b', 'priority', 0)).toEqual({ 'c/d': { quickCheckIntervalMs: 60000 } });
    expect(withRepoSetting(config, 'c/d', 'quickCheckIntervalMs', undefined)).toEqual({ 'a/b': { priority: 2 } });
    expect(withoutRepo(config, 'a/b')).toEqual({ 'c/d': { quickCheckIntervalMs: 60000 } });
  });

  test('a boost adds to every check’s default priority', () => {
    const defaults = [
      { taskType: 'quickCheck' as const, intervalMs: 1, priority: 5 },
      { taskType: 'autoRefresh' as const, intervalMs: 1, priority: 3 },
      { taskType: 'mergedDrain' as const, intervalMs: 1, priority: 1 },
    ];
    expect(boostedPriorities(defaults, -2).map(({ priority }) => priority)).toEqual([3, 1, -1]);
  });
});
