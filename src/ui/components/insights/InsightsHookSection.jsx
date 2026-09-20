/**
 * InsightsHookSection - renders HTML from an optional, user-provided
 * "More Insights" hook script (see VIEW_PRS_INSIGHTS_HOOK_SCRIPT,
 * GET /view-prs/insights-hook, runInsightsHookScript in app.js).
 *
 * Fetched lazily on mount (i.e. only once the row's insights panel is
 * actually expanded). The script is disabled/unset, missing, non-executable,
 * slow, or simply wrong far more often than not - any of those, a network
 * failure, or a non-string/empty response are all treated the same way:
 * render nothing, no error shown to the user. A configured-but-failing hook
 * additionally logs a console.warn (see the server's `error` field) so
 * whoever set up the script has something to debug from.
 *
 * @module components/insights/InsightsHookSection
 */

import React, { useEffect, useState } from 'react';
import { InsightSection } from './InsightSection';

// Registered once, at module load (before this component's first render -
// purify.min.js is a plain <script> loaded ahead of the react-app.jsx module
// script in index.html, so window.DOMPurify already exists by the time
// this runs). DOMPurify strips script execution/event handlers on its own,
// but plain links it leaves untouched still default to no `rel`, so a hook
// returning `<a target="_blank">` would otherwise be exposed to reverse
// tabnabbing (the linked page getting a `window.opener` handle back to us).
if (typeof window !== 'undefined' && window.DOMPurify) {
  window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// <style>/<link>/<base>/<meta> aren't script-execution vectors (DOMPurify
// already blocks those regardless), but they can still affect the whole
// page rather than just this section: a <style> block has no scoping, a
// <link rel="stylesheet"> loads arbitrary CSS, <base> rewrites every
// relative URL/resource on the page, and <meta http-equiv="refresh"> can
// navigate the whole tab. Layout/positioning bleed from inline `style`
// attributes on ordinary elements is instead contained via CSS `contain`
// on the wrapping element (see .pr-insights-hook-content in index.css).
// <form> is forbidden too - DOMPurify's defaults allow it (including
// password-type inputs and an arbitrary cross-origin `action`), and a
// display-only insights panel has no legitimate use for one, but a form
// styled to blend into the dashboard is a plausible phishing vector for a
// buggy or careless hook script (verified empirically: DOMPurify's own
// defaults pass a <form action="http://external..."> straight through).
const SANITIZE_CONFIG = { FORBID_TAGS: ['style', 'link', 'base', 'meta', 'form'] };

export function InsightsHookSection({ repo, prNumber }) {
  const [html, setHtml] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const safeRepo = String(repo || '').trim();
    const safePrNumber = String(prNumber || '').trim();
    if (!safeRepo || !safePrNumber) {
      return undefined;
    }

    if (typeof fetch !== 'function') {
      return undefined;
    }

    try {
      fetch(
        `/view-prs/insights-hook?repo=${encodeURIComponent(safeRepo)}&prNumber=${encodeURIComponent(safePrNumber)}`,
      )
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (cancelled) return;
          // result.error is only ever set when a *configured* hook script
          // actually failed (see runInsightsHookScript in app.js) - never for
          // the common "no hook configured" case - so this only fires for
          // something the repo owner would want to go fix.
          if (result && result.error) {
            console.warn(`[insights hook] ${result.error}`);
          }
          const rawHtml = result && result.ok && typeof result.html === 'string' ? result.html : '';
          setHtml(rawHtml.trim() ? rawHtml : null);
        })
        .catch(() => {
          if (!cancelled) setHtml(null);
        });
    } catch (_error) {
      // Environments without a real fetch (some test setups) can throw
      // synchronously rather than rejecting - either way, discard.
    }

    return () => {
      cancelled = true;
    };
  }, [repo, prNumber]);

  if (!html) {
    return null;
  }

  const sanitizedHtml =
    typeof window !== 'undefined' && window.DOMPurify
      ? window.DOMPurify.sanitize(html, SANITIZE_CONFIG)
      : '';
  if (!sanitizedHtml) {
    return null;
  }

  return (
    <InsightSection summaryText="Custom insights" sectionKey="custom-insights">
      {/* eslint-disable-next-line react/no-danger */}
      <div className="pr-insights-hook-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
    </InsightSection>
  );
}
