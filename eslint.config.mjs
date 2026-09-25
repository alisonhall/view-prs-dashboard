import css from "@eslint/css";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  {
    // PHASE_*.md/PHASES_*.md/ROADMAP.md/src/ui/vendor were previously listed
    // in .eslintignore, which ESLint 9's flat config no longer reads (see
    // the ESLintIgnoreWarning) - migrated here so they're actually honored.
    // REACT_MIGRATION_PLAN.md is new: one of its lines has grown past 150K
    // characters, which sends the markdown parser into a multi-hour hang -
    // confirmed by timing `eslint REACT_MIGRATION_PLAN.md` alone against a
    // 20s timeout with no completion, vs. a normal few seconds once excluded.
    ignores: [
      "**/package-lock.json",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "PHASE_*.md",
      "PHASES_*.md",
      "ROADMAP.md",
      "REACT_MIGRATION_PLAN.md",
      "src/ui/vendor/**",
      // Tool scaffolding/sample content, not authored project docs - its
      // sample prompt deliberately lists literal special characters
      // (including brackets) that the markdown parser misreads as broken
      // reference links.
      ".slingshot/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.jest } },
  },
  {
    // vite.config.js is loaded by Vite as a real ES module regardless of
    // the rest of the project staying CommonJS - override the blanket
    // sourceType: "commonjs" above just for this file.
    files: ["vite.config.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    // pr-row-keys.js is a plain ES module (import/export), not the UMD
    // (CommonJS + browser-global) wrapper every other src/ui/helpers/*.js
    // file uses - it's imported directly by .jsx components via Vite's
    // ESM bundling only, never require()'d, so UMD's dual-environment
    // support buys it nothing. Same reasoning as vite.config.js above.
    files: ["src/ui/components/pr-row-keys.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    // ES module cleanup (see REACT_MIGRATION_PLAN.md): index.page.js and
    // the src/ui/helpers/*.js files listed here have been converted from
    // the UMD wrapper to real `export`/`import` (index.page.js's own
    // <script> tag is now type="module" in index.html) - this list grows
    // as more files convert, same reasoning as pr-row-keys.js above.
    // index.page.js itself still has plain `require(...) :
    // globalThis.ViewPrsXHelpers` conditionals for every not-yet-converted
    // dependency - those parse fine under sourceType: "module" too, since
    // `require`/`module` are just ordinary identifiers, not syntax that
    // sourceType affects.
    files: [
      "src/ui/index.page.js",
      "src/ui/helpers/pr-entry-derived-cache.helpers.js",
      "src/ui/helpers/pr-multi-select-render-cache.helpers.js",
      "src/ui/helpers/pr-section-grouping.helpers.js",
      "src/ui/helpers/pr-notes.helpers.js",
      "src/ui/helpers/pr-data-polling.helpers.js",
      "src/ui/helpers/pr-http.helpers.js",
      "src/ui/helpers/pr-status-display.helpers.js",
      "src/ui/helpers/pr-command-output.helpers.js",
      "src/ui/helpers/pr-data-tabs.helpers.js",
      "src/ui/helpers/pr-activity-badges.helpers.js",
      "src/ui/helpers/pr-backfill.helpers.js",
      "src/ui/helpers/pr-backfill-actions.helpers.js",
      "src/ui/helpers/pr-management-tabs.helpers.js",
      "src/ui/helpers/pr-formatting.helpers.js",
      "src/ui/helpers/pr-actor-identity.helpers.js",
      "src/ui/helpers/pr-actor-identity-style.helpers.js",
      "src/ui/helpers/pr-actor-identity-render.helpers.js",
      "src/ui/helpers/pr-requested-reviewers.helpers.js",
      "src/ui/helpers/pr-assigned-users.helpers.js",
      "src/ui/helpers/pr-approvers.helpers.js",
      "src/ui/helpers/pr-insight-badge-class.helpers.js",
      "src/ui/helpers/pr-insight-metrics-summary.helpers.js",
      "src/ui/helpers/pr-author-cell.helpers.js",
      "src/ui/helpers/pr-ui-render-utils.helpers.js",
      "src/ui/helpers/pr-review-stats-date-bucketing.helpers.js",
      "src/ui/helpers/pr-review-stats-aggregation.helpers.js",
      "src/ui/helpers/pr-review-stats-timeline.helpers.js",
      "src/ui/helpers/pr-author-insights-drafts.helpers.js",
      "src/ui/helpers/pr-author-insights-identity.helpers.js",
      "src/ui/helpers/pr-author-insights-pr-link.helpers.js",
      "src/ui/helpers/pr-author-insights-display.helpers.js",
      "src/ui/helpers/pr-author-insights-data.helpers.js",
      "src/ui/helpers/pr-needs-attention.helpers.js",
      "src/ui/helpers/pr-ui-option-scroll.helpers.js",
      "src/ui/helpers/pr-dom-access.helpers.js",
      "src/ui/helpers/pr-dom-traversal.helpers.js",
      "src/ui/helpers/pr-section-open-state.helpers.js",
      "src/ui/helpers/pr-applied-summary.helpers.js",
      "src/ui/helpers/pr-merged-request-more-config.helpers.js",
      "src/ui/helpers/pr-merged-request-more-action.helpers.js",
      "src/ui/helpers/pr-scope-selection.helpers.js",
      "src/ui/helpers/pr-scope-settings.helpers.js",
      "src/ui/helpers/pr-repo-run-context.helpers.js",
      "src/ui/helpers/pr-render-context.helpers.js",
      "src/ui/helpers/pr-row-sources.helpers.js",
      "src/ui/helpers/pr-run-pr-data-context.helpers.js",
      "src/ui/helpers/pr-stored-data-load.helpers.js",
      "src/ui/helpers/pr-single-pr-update.helpers.js",
      "src/ui/helpers/pr-render-viewer-filter-setup.helpers.js",
      "src/ui/helpers/pr-viewer-context.helpers.js",
      "src/ui/helpers/pr-filter-options.helpers.js",
      "src/ui/helpers/pr-scoped-rows.helpers.js",
      "src/ui/helpers/pr-render-summary.helpers.js",
      "src/ui/helpers/pr-render-apply.helpers.js",
      "src/ui/helpers/pr-filter-pipeline.helpers.js",
      "src/ui/helpers/pr-filter-selection-inputs.helpers.js",
      "src/ui/helpers/pr-render-summary-inputs.helpers.js",
      "src/ui/helpers/pr-render-filter-summary.helpers.js",
      "src/ui/helpers/pr-render-apply-inputs.helpers.js",
      "src/ui/helpers/pr-render-finalize.helpers.js",
      "src/ui/helpers/pr-render-pipeline.helpers.js",
      "src/ui/helpers/pr-render-state-commit.helpers.js",
      "src/ui/helpers/pr-selected-filters.helpers.js",
      "src/ui/helpers/pr-row-filtering.helpers.js",
      "src/ui/helpers/pr-dom-visibility.helpers.js",
      "src/ui/helpers/pr-auto-render-blocking.helpers.js",
      "src/ui/helpers/pr-auto-render-unsaved.helpers.js",
      "src/ui/helpers/pr-auto-render-navigation.helpers.js",
      "src/ui/helpers/pr-auto-render-indicator.helpers.js",
      "src/ui/helpers/pr-auto-render-indicator-links.helpers.js",
      "src/ui/helpers/pr-auto-render-state.helpers.js",
      "src/ui/helpers/pr-apply-filters-cache.helpers.js",
      "src/ui/helpers/pr-export.helpers.js",
      "src/ui/components/pr-author-insights.component.js",
      "src/ui/helpers/pr-filter-panel.helpers.js",
      "src/ui/helpers/react-callbacks.helpers.js",
      "src/ui/helpers/form-parsing.helpers.js",
      "src/ui/orchestrators/pr-data-tab.orchestrator.js",
      "src/ui/orchestrators/backfill-tab.orchestrator.js",
      "src/ui/helpers/pr-section-config.helpers.js",
      "src/ui/helpers/pr-smart-groups.helpers.js",
    ],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    // gfm (not commonmark): these docs use GitHub-flavored task-list
    // checkboxes ("- [ ]"/"- [x]"), which pure CommonMark has no concept
    // of - it parses "[ ]"/"[x]" as reference-style link shorthand instead,
    // and markdown/no-missing-label-refs then flags every single checkbox
    // as a broken link reference. gfm parses task lists correctly.
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["src/ui/**/*.{js,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/src/server/**",
            "**/src/script/**",
            "**/src/backfill/**",
            "**/src/dependencies/**",
            "**/src/schema/**",
          ],
        },
      ],
      "no-restricted-modules": [
        "error",
        {
          patterns: [
            "**/src/server/**",
            "**/src/script/**",
            "**/src/backfill/**",
            "**/src/dependencies/**",
            "**/src/schema/**",
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**/*.{js,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["**/src/ui/**"],
        },
      ],
      "no-restricted-modules": [
        "error",
        {
          patterns: ["**/src/ui/**"],
        },
      ],
    },
  },
  {
    files: ["src/server/storage/**/*.{js,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["**/src/server/routes/**"],
        },
      ],
      "no-restricted-modules": [
        "error",
        {
          patterns: ["**/src/server/routes/**"],
        },
      ],
    },
  },
]);
