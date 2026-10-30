/**
 * The optional, user-provided insights hook script's HTML (see
 * VIEW_PRS_INSIGHTS_HOOK_SCRIPT, GET /view-prs/insights-hook,
 * runInsightsHookScript in app.js), shown as the detail pane's "Custom
 * insights" tab - which only exists when the hook returned something.
 *
 * useInsightsHookHtml fetches it for one PR and returns the sanitized HTML,
 * or null. The script is disabled/unset, missing, non-executable, slow, or
 * simply wrong far more often than not - any of those, a network failure,
 * or a non-string/empty response are all treated the same way: null, no
 * error shown to the user. A configured-but-failing hook additionally logs
 * a console.warn (see the server's `error` field) so whoever set up the
 * script has something to debug from.
 *
 * @module components/insights/InsightsHook
 */

import { useEffect, useState } from 'react';

interface DomPurifyNode {
  tagName?: string;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
}

interface DomPurify {
  addHook: (name: string, hook: (node: DomPurifyNode) => void) => void;
  sanitize: (html: string, config: object) => string;
}

const getDomPurify = (): DomPurify | undefined =>
  typeof window !== 'undefined' ? (window as unknown as { DOMPurify?: DomPurify }).DOMPurify : undefined;

// Registered once, at module load (before the first render - purify.min.js
// is a plain <script> loaded ahead of the react-app.tsx module script in
// index.html, so window.DOMPurify already exists by the time this runs).
// DOMPurify strips script execution/event handlers on its own, but plain
// links it leaves untouched still default to no `rel`, so a hook returning
// `<a target="_blank">` would otherwise be exposed to reverse tabnabbing
// (the linked page getting a `window.opener` handle back to us).
getDomPurify()?.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// <style>/<link>/<base>/<meta> aren't script-execution vectors (DOMPurify
// already blocks those regardless), but they can still affect the whole
// page rather than just this section: a <style> block has no scoping, a
// <link rel="stylesheet"> loads arbitrary CSS, <base> rewrites every
// relative URL/resource on the page, and <meta http-equiv="refresh"> can
// navigate the whole tab. Layout/positioning bleed from inline `style`
// attributes on ordinary elements is instead contained via CSS `contain`
// on the wrapping element (see .pr-insights-hook-content in styles/insights.css).
// <form> is forbidden too - DOMPurify's defaults allow it (including
// password-type inputs and an arbitrary cross-origin `action`), and a
// display-only insights panel has no legitimate use for one, but a form
// styled to blend into the dashboard is a plausible phishing vector for a
// buggy or careless hook script (verified empirically: DOMPurify's own
// defaults pass a <form action="http://external..."> straight through).
const SANITIZE_CONFIG = { FORBID_TAGS: ['style', 'link', 'base', 'meta', 'form'] };

interface HookResult {
  ok?: boolean;
  html?: unknown;
  error?: string | null;
}

// The server runs the script (a new process) for every request, so the
// pane only asks once its selection has been still this long - ↑/↓ through
// ten PRs doesn't start ten scripts - and remembers each PR's answer for
// the session, per data version (the script may read the PR's data).
// Failures aren't remembered, so a fixed script works on the next look.
export const INSIGHTS_HOOK_DELAY_MS = 300;
const hookHtmlByKey = new Map<string, string | null>();

// For tests: forget every remembered answer.
export const clearInsightsHookCache = () => hookHtmlByKey.clear();

export function useInsightsHookHtml(
  repo: string | undefined,
  prNumber: string | number | undefined,
  version: string = '',
): string | null {
  const safeRepo = String(repo || '').trim();
  const safePrNumber = String(prNumber || '').trim();
  const key = safeRepo && safePrNumber ? `${safeRepo}#${safePrNumber}#${version}` : '';
  // An answer that isn't remembered (a failure), for the key it's for.
  const [unremembered, setUnremembered] = useState<{ key: string; html: string | null }>({ key: '', html: null });
  // Re-renders once a remembered answer arrives.
  const [, setAnswered] = useState(0);

  useEffect(() => {
    if (!key || hookHtmlByKey.has(key) || typeof fetch !== 'function') {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      try {
        fetch(`/view-prs/insights-hook?repo=${encodeURIComponent(safeRepo)}&prNumber=${encodeURIComponent(safePrNumber)}`)
          .then((response) => (response.ok ? (response.json() as Promise<HookResult>) : null))
          .then((result) => {
            // result.error is only ever set when a *configured* hook script
            // actually failed (see runInsightsHookScript in app.js) - never
            // for the common "no hook configured" case - so this only fires
            // for something the repo owner would want to go fix.
            if (result && result.error) {
              console.warn(`[insights hook] ${result.error}`);
            }
            const rawHtml = result && result.ok && typeof result.html === 'string' ? result.html : '';
            const sanitized = rawHtml.trim() ? getDomPurify()?.sanitize(rawHtml, SANITIZE_CONFIG) || '' : '';
            const html = sanitized || null;
            if (result?.ok && !result.error) {
              hookHtmlByKey.set(key, html);
              if (!cancelled) setAnswered((count) => count + 1);
            } else if (!cancelled) {
              setUnremembered({ key, html });
            }
          })
          .catch(() => {
            if (!cancelled) setUnremembered({ key, html: null });
          });
      } catch {
        // Environments without a real fetch (some test setups) can throw
        // synchronously rather than rejecting - either way, discard.
      }
    }, INSIGHTS_HOOK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, safeRepo, safePrNumber]);

  if (!key) return null;
  if (hookHtmlByKey.has(key)) return hookHtmlByKey.get(key) ?? null;
  return unremembered.key === key ? unremembered.html : null;
}

// The sanitized HTML from useInsightsHookHtml.
export function InsightsHookContent({ html }: { html: string }) {
  return <div className="pr-insights-hook-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
