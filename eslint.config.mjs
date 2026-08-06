import css from "@eslint/css";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  {
    ignores: ["**/package-lock.json", "coverage/**"],
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
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/commonmark",
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
