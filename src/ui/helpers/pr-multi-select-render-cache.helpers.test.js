const {
  createMultiSelectRenderCache,
} = require("./pr-multi-select-render-cache.helpers.js");

describe("pr multi-select render cache helpers", () => {
  test("given the same listId and items twice in a row, when rendering the second time, then the wrapped render function is not called again", () => {
    const renderFn = jest.fn(() => true);
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(renderFn);

    const items = [
      { value: "bug", label: "bug", checked: false },
      { value: "frontend", label: "frontend", checked: true },
    ];

    expect(render("label-list", items)).toBe(true);
    expect(renderFn).toHaveBeenCalledTimes(1);

    // A different array reference with the same value/checked content.
    const sameContentItems = items.map((item) => ({ ...item }));
    expect(render("label-list", sameContentItems)).toBe(true);
    expect(renderFn).toHaveBeenCalledTimes(1);
  });

  test("given only the checked state differs, when rendering again, then the wrapped render function is called (avoids stale checkboxes)", () => {
    const renderFn = jest.fn(() => true);
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(renderFn);

    render("label-list", [{ value: "bug", label: "bug", checked: false }]);
    expect(renderFn).toHaveBeenCalledTimes(1);

    render("label-list", [{ value: "bug", label: "bug", checked: true }]);
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  test("given the option set differs, when rendering again, then the wrapped render function is called", () => {
    const renderFn = jest.fn(() => true);
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(renderFn);

    render("label-list", [{ value: "bug", label: "bug", checked: false }]);
    expect(renderFn).toHaveBeenCalledTimes(1);

    render("label-list", [
      { value: "bug", label: "bug", checked: false },
      { value: "frontend", label: "frontend", checked: false },
    ]);
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  test("given two different listIds with identical items, when rendering each once, then both call through independently", () => {
    const renderFn = jest.fn(() => true);
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(renderFn);

    const items = [{ value: "bug", label: "bug", checked: false }];
    render("label-list", items);
    render("exclude-label-list", items);

    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(renderFn).toHaveBeenNthCalledWith(1, "label-list", items);
    expect(renderFn).toHaveBeenNthCalledWith(2, "exclude-label-list", items);
  });

  test("given the render function reports it did not handle the call (e.g. React hasn't mounted yet), when rendering again with the exact same items, then it retries instead of skipping", () => {
    // Regression test: renderFn returning false (the established
    // "not handled yet" contract used throughout index.page.js's
    // typeof-guard bridges) must not get cached as "already rendered" -
    // otherwise a later, genuinely-renderable call with the same items
    // would be wrongly skipped forever, leaving the dropdown permanently
    // unpopulated once React finally mounts.
    const renderFn = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(renderFn);

    const items = [{ value: "bug", label: "bug", checked: false }];

    expect(render("label-list", items)).toBe(false);
    expect(renderFn).toHaveBeenCalledTimes(1);

    // Same exact items again - must retry, not skip, since the first call
    // never actually succeeded.
    expect(render("label-list", items)).toBe(true);
    expect(renderFn).toHaveBeenCalledTimes(2);

    // Now that it succeeded, a third identical call is safe to skip.
    expect(render("label-list", items)).toBe(true);
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  test("given no render function is provided, when rendering, then it safely returns false instead of throwing", () => {
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(undefined);

    let result;
    expect(() => {
      result = render("label-list", []);
    }).not.toThrow();
    expect(result).toBe(false);
  });

  test("given non-array items, when rendering, then it treats them as an empty list without throwing", () => {
    const renderFn = jest.fn(() => true);
    const { wrapRenderMultiSelectList } = createMultiSelectRenderCache();
    const render = wrapRenderMultiSelectList(renderFn);

    expect(() => render("label-list", null)).not.toThrow();
    expect(renderFn).toHaveBeenCalledWith("label-list", null);
  });
});
