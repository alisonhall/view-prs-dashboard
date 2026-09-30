// Babel config used only by Jest (via jest.config.js's `transform` option) to
// parse JSX in React component tests. Vite has its own independent JSX
// pipeline (@vitejs/plugin-react) and does not read this file, so this can't
// change anything about how the app actually builds/runs.
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
};
