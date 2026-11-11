import { summarizeSinceLastLooked } from './pr-activity-feed.helpers.ts';
import { describeChangeTooltip, summarizeChange, withCountedChange } from './pr-change-summary.helpers.ts';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const row = { status: 'CHANGED', reason: 'commit|review|ack-cleared' };
const since = summarizeSinceLastLooked(
  [
    { sourceId: 'c1', occurredAt: '2026-10-23T00:00:00Z', actor: 'ann', type: 'commit', channel: 'commit' },
    { sourceId: 'c2', occurredAt: '2026-10-23T01:00:00Z', actor: 'ann', type: 'commit', channel: 'commit' },
  ],
  { lastLookedAt: '2026-10-02T09:00:00Z' },
);
const change = summarizeChange({ row, lastLookedAt: '2026-10-02T09:00:00Z', lastAckedAt: '', since, nowMs: NOW, timeZone: 'UTC' });

describe('summarizeChange', () => {
  test('since when, the counts, and the reasons they leave unsaid - a reason whose kind has no count among them', () => {
    expect(change).toEqual({
      when: 'since your last activity on Oct 2',
      counts: '2 commits',
      others: ['New reviews', 'Ack was cleared'],
    });
  });

  test('every reason when nothing new could be counted', () => {
    const none = summarizeChange({ row, lastLookedAt: '', lastAckedAt: '', since: summarizeSinceLastLooked([], { lastLookedAt: '' }), nowMs: NOW });
    expect(describeChangeTooltip(none)).toEqual(['Changed since your last ack', 'New commits', 'New reviews', 'Ack was cleared']);
  });
});

describe('describeChangeTooltip', () => {
  test('since when, the counts, then the other reasons', () => {
    expect(describeChangeTooltip(change)).toEqual(['Changed since your last activity on Oct 2', '2 commits', 'New reviews', 'Ack was cleared']);
  });
});

describe('withCountedChange', () => {
  test("the change's reasons become one counted line where the first was", () => {
    expect(withCountedChange(['1 pending comment', 'New commits', 'New reviews', 'Ack was cleared'], row, change)).toEqual([
      '1 pending comment',
      'Since your last activity on Oct 2: 2 commits',
      'New reviews',
      'Ack was cleared',
    ]);
  });

  test("as they were when the change isn't among them, or nothing could be counted", () => {
    expect(withCountedChange(['1 pending comment'], row, change)).toEqual(['1 pending comment']);
    expect(withCountedChange(['New commits'], row, { ...change, counts: '' })).toEqual(['New commits']);
  });
});
