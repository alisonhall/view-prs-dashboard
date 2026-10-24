/**
 * Skips re-rendering a multi-select filter list when its items haven't
 * changed (MultiSelectListPortals). `wrapRenderMultiSelectList` wraps a
 * render function once; each call builds a signature from (listId, items)
 * and skips calling through when it matches the last call for that list.
 *
 * `checked` is part of the signature, not just `value`/`label`: each
 * item's `checked` reflects the *current filter selection*, not just row
 * data, so skipping based on the option set alone would leave stale
 * checkboxes on screen whenever the user's selection changed but the
 * available options didn't - a real regression, not just a missed
 * optimization. Including it keeps the skip correct while still winning
 * on the common case (a poll with no user interaction changes neither).
 */
export interface MultiSelectItem {
  value?: unknown;
  checked?: boolean;
}

// Returns truthy once the list was actually rendered.
export type RenderMultiSelectList<I extends MultiSelectItem> = (listId: string, items: I[]) => unknown;

const createMultiSelectRenderCache = () => {
  const lastSignatureByListId = new Map<string, string>();

  // NUL between an item's fields and SOH between items: control characters
  // chosen because they won't appear in label names or logins.
  const buildItemsSignature = (items: MultiSelectItem[] | null | undefined): string =>
    (Array.isArray(items) ? items : [])
      .map((item) => `${item?.value}\u0000${item?.checked ? 1 : 0}`)
      .join("\u0001");

  const wrapRenderMultiSelectList = <I extends MultiSelectItem>(renderFn: RenderMultiSelectList<I>) => {
    const renderFnSafe: RenderMultiSelectList<I> = typeof renderFn === "function" ? renderFn : () => false;
    return (listId: string, items: I[]): unknown => {
      const signature = buildItemsSignature(items);
      if (lastSignatureByListId.get(listId) === signature) {
        return true;
      }
      // Only record the signature once renderFn reports it handled the
      // call (truthy return). A falsy return means the list couldn't be
      // rendered yet; recording it anyway would make a later call with the
      // same items - now renderable - be skipped forever, leaving that
      // dropdown permanently empty.
      const handled = renderFnSafe(listId, items);
      if (handled) {
        lastSignatureByListId.set(listId, signature);
      }
      return handled;
    };
  };

  return {
    wrapRenderMultiSelectList,
  };
};

export { createMultiSelectRenderCache };
