// Babel config used only by Jest (via jest.config.js's `transform` option) to
// parse JSX and TypeScript in tests. Vite has its own independent pipeline
// (@vitejs/plugin-react, esbuild for TypeScript) and does not read this file,
// so this can't change anything about how the app actually builds/runs.
// preset-typescript only strips types; `npm run typecheck` checks them.
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
    "@babel/preset-typescript",
  ],
};
