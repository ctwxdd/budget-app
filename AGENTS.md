# Agent Instructions

## Design Guidelines

- Keep the startup bundle lean. Do not statically import heavy routes, charts, or rarely opened dialogs from app/layout entry points.
- Prefer route-level and interaction-triggered lazy loading for large UI surfaces such as Analytics, Add/Edit dialogs, and feature pages.
- Do not idle-preload expensive routes, especially Analytics/Recharts, on mobile. Preload only when the user is likely to navigate there, such as pointer/focus on the target control.
- After changes that touch layout, routing, imports, charts, or global dialogs, run `npm run build` and compare the emitted `index-*.js` gzip size. Treat unexpected startup bundle growth as a regression to explain or fix.
