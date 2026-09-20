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
