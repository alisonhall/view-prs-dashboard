import css from "@eslint/css";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig } from "eslint/config";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    // PHASE_*.md/PHASES_*.md/ROADMAP.md/src/ui/vendor were previously listed
    // in .eslintignore, which ESLint 9's flat config no longer reads (see
    // the ESLintIgnoreWarning) - migrated here so they're actually honored.
    // REACT_MIGRATION_PLAN.md is new: one of its lines has grown past 150K
    // characters, which sends the markdown parser into a multi-hour hang -
    // confirmed by timing `eslint REACT_MIGRATION_PLAN.md` (now under
    // docs/history/) alone against a
    // 20s timeout with no completion, vs. a normal few seconds once excluded.
    ignores: [
      "**/package-lock.json",
      "coverage/**",
      "dist/**",
      "test-results/**",
      "playwright-report/**",
      "PHASE_*.md",
      "PHASES_*.md",
      "ROADMAP.md",
      "docs/history/REACT_MIGRATION_PLAN.md",
      "src/ui/vendor/**",
      // Tool scaffolding/sample content, not authored project docs - its
      // sample prompt deliberately lists literal special characters
      // (including brackets) that the markdown parser misreads as broken
      // reference links.
      ".slingshot/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.jest } },
  },
  {
    // Previously entirely unmatched by any `files` pattern in this config -
    // ESLint's flat config only lints a file if some block's `files`
    // pattern names it, so every *.jsx file (81 components, all real ES
    // modules with JSX syntax - see REACT_MIGRATION_PLAN.md) was silently
    // skipped ("File ignored because no matching configuration was
    // supplied") rather than actually linted. Real ES modules, unlike the
    // plain **/*.js block above's default `sourceType: "commonjs"` - and
    // needs the parser told to accept JSX syntax explicitly.
    files: ["**/*.jsx"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.jest },
    },
    rules: {
      // Deliberately not eslint-plugin-react-hooks's full "recommended"
      // preset (v7 folds in ~15 additional React Compiler-oriented rules -
      // purity/immutability/set-state-in-effect/etc. - tuned for compiler
      // memoization safety, which this codebase doesn't use and whose
      // assumptions don't always fit patterns already deliberately used
      // and documented here, e.g. flushSync, window.* bridge reads inside
      // effects). These two are the long-established, uncontroversial
      // ones: rules-of-hooks catches genuine hook-ordering bugs
      // (conditional/looped hook calls), exhaustive-deps catches stale-
      // closure bugs from missing effect dependencies.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // TypeScript (AI_MODERNIZATION_PLAN.md Phase 12). Type errors are tsc's
    // job (`npm run typecheck`); this is the non-type-aware recommended set
    // plus the same two react-hooks rules as the .jsx block above.
    files: ["**/*.{ts,tsx}"],
    plugins: { js, "react-hooks": reactHooks },
    extends: ["js/recommended", tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.jest },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Same options as no-unused-vars for JS below.
      "@typescript-eslint/no-unused-vars": [
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
    // vite.config.js is loaded by Vite as a real ES module regardless of
    // the rest of the project staying CommonJS - override the blanket
    // sourceType: "commonjs" above just for this file.
    files: ["vite.config.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    // Every non-test src/ui/helpers/*.js file (and pr-row-keys.js) is an ES
    // module, overriding the blanket sourceType: "commonjs" above. Their
    // tests and the test fixtures still use require(), which Babel handles.
    files: ["src/ui/helpers/*.js", "src/ui/components/pr-row-keys.js"],
    ignores: ["**/*.test.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    // tsc reads its tsconfig files as JSON with comments.
    files: ["tsconfig*.json"],
    language: "json/jsonc",
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
    files: ["**/*.{js,mjs,cjs,jsx}"],
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
    files: ["src/ui/**/*.{js,mjs,cjs,jsx,ts,tsx}"],
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
