import { useMemo } from 'react';
import type { PrData } from '../types/pr-data.ts';
import { useOptionalPrData } from './PrDataContext';
import { usePrInsightsDisplay } from './PrInsightsDisplayContext';
import {
  getLastAckedAt,
  getLastLookedAt,
  newCommitOidsFor,
  summarizeSinceLastLooked,
  type SinceLastLooked,
} from '../helpers/pr-activity-feed.helpers.ts';

export interface SinceLastLookedState {
  // Your last activity or Ack, whichever is later; "" when neither is known.
  lastLookedAt: string;
  lastAckedAt: string;
  since: SinceLastLooked;
}

/**
 * What's new on a PR since you last looked (the Activity tab's "Since I
 * last looked"), from the loaded data's Acks: for the row's change
 * tooltip and its summary. Null while `enabled` is false, so a row that
 * hasn't changed doesn't build its feed.
 */
export function useSinceLastLooked(pr: PrData, repo: string, enabled = true): SinceLastLookedState | null {
  const payload = useOptionalPrData()?.payload;
  const { buildActivityEvents } = usePrInsightsDisplay();
  const prNumber = String(pr?.number ?? '');
  const history = payload?.ackHistoryByRepo?.[repo]?.[prNumber];
  const currentAck = String(payload?.ackByRepo?.[repo]?.[prNumber] || '');

  return useMemo(() => {
    if (!enabled) return null;
    const lastAckedAt = getLastAckedAt(history, currentAck);
    const lastLookedAt = getLastLookedAt(pr?.baseline, lastAckedAt);
    const since = summarizeSinceLastLooked(buildActivityEvents(pr, Number.POSITIVE_INFINITY), {
      lastLookedAt,
      newCommitOids: newCommitOidsFor(pr, lastLookedAt),
    });
    return { lastLookedAt, lastAckedAt, since };
  }, [enabled, history, currentAck, pr, buildActivityEvents]);
}
