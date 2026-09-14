# Performance Optimization Opportunities

> **Note (2026-09-15):** the PR table has since been migrated to React (see
> `REACT_MIGRATION_PLAN.md`, now complete). That migration's own Phase 5
> ("Performance Tuning") superseded #7 and #8 below with a different
> mechanism than either originally proposed - see those items for details.
> Everything else here (the completed vanilla debouncing work, and the
> still-open virtual-scrolling idea) remains accurate.

## ✅ Already Optimized (Completed)

### 1. **Checkbox Toggle Performance** ✅ COMPLETED
- **Issue:** Full table re-render on checkbox click (500-1000ms lag)
- **Solution:** Skip `renderPrData()` call, checkbox already visually updated
- **Impact:** 50-100x faster (now <10ms)
- **Implemented:** January 2025

### 2. **Textarea Input Performance** ✅ COMPLETED
- **Issue:** `recomputeDirtyPrSectionsFields()` called on every keystroke
- **Solution:** Debounce textarea inputs (300ms)
- **Impact:** Smooth typing, no per-keystroke lag
- **Implemented:** January 2025

### 3. **Filter Change Performance** ✅ COMPLETED
- **Issue:** Every filter dropdown/checkbox change triggered full table re-render
- **Solution:** Debounce filter changes (150ms) - batch rapid adjustments
- **Impact:** 80-90% reduction in re-renders when changing multiple filters
- **Implemented:** January 2025

---

## 🎯 Future Opportunities (Deferred - Diminishing Returns)

### 4. **Multi-Select Filter Performance** ✅ COMPLETED (covered by filter debouncing)
- **Issue:** Multi-select lists re-rendered on every selection
- **Solution:** Debounced filter changes (150ms) handle multi-select automatically
- **Impact:** Eliminates 4-10 unnecessary re-renders when selecting multiple items
- **Implemented:** January 2025 (part of filter debouncing)

---

### 5. **Auto-Refresh Optimization** 💡 DEFERRED (low ROI)

**Problem:**
- Auto-refresh polls every 30 seconds
- If no changes, still does expensive fingerprint comparison

**Current Code:**
```javascript
// Line ~6500: Auto-refresh logic
const newFingerprint = computeDataFingerprintSafe(latestData, effectiveRepo);
if (newFingerprint === lastRenderedPrFingerprint) {
  // No changes, but still computed expensive fingerprint
}
```

**Solution:**
- Add server-side ETag or Last-Modified header
- Skip fingerprint computation if HTTP 304 Not Modified

**Estimated Impact:**
- Minor - saves CPU during idle time
- More efficient polling

---

## 💡 Medium-Impact Opportunities

### 6. **Virtual Scrolling for Large PR Lists** 💭

**Problem:**
- With 100+ PRs, rendering all rows is expensive
- Most rows are off-screen

**Solution:**
- Only render visible rows (virtual scrolling)
- Render 20-30 rows at a time, update on scroll

**Estimated Impact:**
- **10-50x faster initial render** for large PR lists
- Maintains smooth scrolling
- Complex implementation (20-50 hours)

**Recommendation:** Only if users have 200+ PRs regularly

---

### 7. **Smart Group Count Caching** ✅ COMPLETED (via React migration)

**Original problem:** smart group counts recomputed on every render;
predicate functions run for every PR.

**What actually shipped:** not per-render caching of the *count*, but a
per-entry cache of the *underlying derived values* those predicates read
(labels, assignee/approver logins) - `pr-entry-derived-cache.helpers.js`,
added in `REACT_MIGRATION_PLAN.md`'s Phase 5 ("Delta-aware render
pipeline", 2026-09-14). A `WeakMap` keyed by PR entry object means an
unchanged entry (same object reference across a polling delta merge)
reuses its cached derived values instead of recomputing them - see that
plan's own writeup for the full mechanism and measured impact.

---

### 8. **Memoize Filter Results** ✅ COMPLETED (via React migration)

**Original problem:** filter pipeline re-executes on every render; same
filters produce same results.

**What actually shipped:** the same `pr-entry-derived-cache.helpers.js`
cache (see #7 above) applied to `rowMatchesUiFilters`
(`pr-row-filtering.helpers.js`), keyed per `(entry, current-filter-criteria-fingerprint)`
rather than a single global `filterCache` keyed on filters alone - so an
unchanged entry under unchanged filters is a cache hit, while a filter
change still correctly busts every entry's cached match result. Measured
result: 8-19% faster across the delta-update scenarios this originally
targeted - see `REACT_MIGRATION_PLAN.md`'s Phase 5 writeup for the full
before/after numbers.

---

## 🔬 Low-Impact Opportunities

### 9. **Date Formatting Optimization**

**Problem:**
- `formatIsoDatetime()` called hundreds of times per render
- Date parsing is relatively expensive

**Solution:**
- Cache formatted dates
- Use `Intl.DateTimeFormat` (faster)

**Estimated Impact:**
- 2-5% faster renders
- Minimal user-perceived difference

---

### 10. **DOM Manipulation Batching**

**Problem:**
- Multiple DOM updates in loops
- Each update triggers layout/paint

**Solution:**
- Build entire table in DocumentFragment
- Single append to DOM

**Estimated Impact:**
- 5-10% faster renders
- Already partially implemented

---

## 📊 Priority Recommendations

### **Immediate Actions** (1-2 hours each)

1. ✅ **Checkbox toggle optimization** - DONE
2. ✅ **Textarea debouncing** - DONE
3. ⚠️ **Debounce filter changes** - HIGH PRIORITY
4. ⚠️ **Debounce multi-select filters** - MEDIUM PRIORITY

### **Future Considerations** (5-20 hours each)

5. Virtual scrolling (if 200+ PRs common) - still open
6. ~~Smart group caching~~ - ✅ done, see #7 above
7. ~~Filter result memoization~~ - ✅ done, see #8 above

### **Not Recommended** (low ROI)

8. Date formatting optimization
9. DOM batching improvements
10. Auto-refresh fingerprinting

---

## 🎯 Next Steps

### **Recommended: Implement #3 - Filter Change Debouncing**

**Effort:** 30 minutes  
**Impact:** Huge - eliminates 80-90% of unnecessary re-renders  
**Risk:** Very low - simple, well-tested pattern  

**Implementation:**
```javascript
// Add at top of file
let filterChangeDebounceTimer = null;

const debouncedApplyFilters = () => {
  if (filterChangeDebounceTimer) {
    clearTimeout(filterChangeDebounceTimer);
  }
  filterChangeDebounceTimer = setTimeout(() => {
    applyFiltersFromCache();
  }, 150);
};

// Replace all applyFiltersFromCache event listeners with:
// .addEventListener("change", debouncedApplyFilters);
```

**Expected Result:**
- Changing 5 filters goes from 5 re-renders to 1 re-render
- No perceptible delay (150ms is imperceptible)
- Smoother UI when adjusting multiple filters

---

## 📈 Performance Testing Methodology

### **Before/After Measurements:**

1. **Measure full render time:**
   ```javascript
   console.time('renderPrData');
   renderPrData(payload);
   console.timeEnd('renderPrData');
   ```

2. **Count re-renders:**
   ```javascript
   let renderCount = 0;
   const originalRender = renderPrData;
   renderPrData = (...args) => {
     renderCount++;
     console.log('Render #', renderCount);
     return originalRender(...args);
   };
   ```

3. **User scenarios:**
   - Change 5 filter checkboxes rapidly
   - Type 100 characters in notes field
   - Toggle 10 in-review checkboxes
   - Measure time from click to UI update

### **Success Metrics:**

- Filter changes: <100ms perceived lag
- Checkbox toggles: <10ms perceived lag
- Textarea typing: Zero lag
- Reduce re-render count by 70%+

---

## 🎉 Summary

**Completed Optimizations:**
- ✅ Checkbox toggles: 50-100x faster
- ✅ Textarea inputs: Smooth, no lag

**High-Value Next Steps:**
- ⚠️ Filter debouncing: 80-90% fewer re-renders
- ⚠️ Multi-select optimization: Better UX

**Current Performance:**
- Small repos (10-20 PRs): Excellent
- Medium repos (50-100 PRs): Good
- Large repos (100+ PRs): Could be better

**With All Optimizations:**
- All repo sizes: Excellent, instant feel
- 90%+ reduction in unnecessary re-renders
- Professional-grade performance
