# Verifying your work

Run every applicable check before reporting a task complete, and paste the
output. If a check fails, fix the code, not the check. Never skip or delete a
failing test.

One-time setup: `npm install` then `npx playwright install chromium`.

Keep the commands as a list. `scripts/sdlc doctor` reads them from lines
beginning with `- `, so a table here reads well to a person and leaves the
gate reporting that no commands are recorded.

- `npm run lint` runs `eslint . && tsc --noEmit`. Healthy: no output, exit 0.
- `npm test` runs `vitest run`. Healthy: `Test Files  13 passed (13)` and
  `Tests  115 passed (115)`.
- `npm run build` runs `vite build`. Healthy: `✓ built in …` and a `dist/`
  listing that includes `render-worker` and `reference-worker` assets.
- `npm run test:e2e` runs `playwright test` against the dev server it starts.
  Healthy: `10 passed`.

The end-to-end walkthrough in the design's Verification section is run by a
person in Chrome against `npm run dev`. Steps 3 and 4 reach depths the
Playwright suite never touches, so re-run them by hand after changing
`perturb.ts`, `bla.ts` or `reference.ts`.
