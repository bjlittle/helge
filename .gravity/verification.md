# Verifying your work

Run every applicable check before reporting a task complete, and paste the
output. If a check fails, fix the code, not the check. Never skip or delete a
failing test.

One-time setup: `npm install` then `npx playwright install chromium`.

| Command | What it runs | Healthy output |
|---|---|---|
| `npm run lint` | `eslint . && tsc --noEmit` | nothing, exit 0 |
| `npm test` | `vitest run` | `Test Files  13 passed (13)`, `Tests  113 passed (113)` |
| `npm run build` | `vite build` | `✓ built in …` with a `dist/` listing |
| `npm run test:e2e` | `playwright test` against the dev server it starts | `10 passed` |

The end-to-end walkthrough in the design's Verification section is run by a
person in Chrome against `npm run dev`.
