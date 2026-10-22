# Project history

Completed plans, kept as the record of how and why the code got to its current
shape. Many source comments point here by bare filename (for example, "see
REACT_MIGRATION_PLAN.md"); search for the filename to find the right file.

- `REACT_MIGRATION_PLAN.md` - the vanilla-JS-to-React migration of the UI,
  phase by phase, including the decisions and bugs found along the way.
  Complete.
- `WINDOW_BRIDGE_ELIMINATION_PLAN.md` - the migration's final step: removing
  every `window.*` bridge between the old vanilla `index.page.js` and React,
  then deleting `index.page.js`. Complete. Its "Lessons" section is still
  useful working guidance for this repo.
