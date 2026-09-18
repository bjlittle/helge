# Agent instructions for project-wibble

## Commands

One-time setup: `npm install` then `npx playwright install chromium`.

- `npm run lint` — `eslint . && tsc --noEmit`. Healthy: no output, exit 0.
- `npm test` — `vitest run`. Healthy: `Test Files  13 passed (13)` and `Tests  110 passed (110)`.
- `npm run build` — `vite build`. Healthy: `✓ built in …` and a `dist/` listing including `render-worker` and `reference-worker` assets.
- `npm run test:e2e` — `playwright test`; starts the dev server itself. Healthy: `10 passed`.
- `npm run dev` — the static localhost at `http://localhost:5173/` with the cross-origin isolation headers the app needs.

## Conventions

- `src/bigfloat.ts`, `mandelbrot.ts`, `reference.ts`, `bla.ts`, `perturb.ts`, `viewport.ts`, `palette.ts`, `filename.ts` are pure: no DOM imports, no side effects at import. Everything that touches the browser lives in `main.ts`, `canvas.ts`, `input.ts`, `ui.ts`, `history.ts` and the two worker entries.
- Worker protocol types live in `scheduler.ts`; workers import them as types only.
- Worker entry files cast `self` via `worker-scope.ts` rather than adding the WebWorker lib, which conflicts with the DOM lib.
- The design authority is `docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md`; when code and spec disagree, fix one and say which.
- Unit tests in `tests/` import from `../src`; the Playwright spec in `e2e/` is the only place canvas, input and UI are exercised.

## Architecture

A browser-only Mandelbrot viewer. `main.ts` owns the view state, wires input to `viewport.ts`
(zoom, pan, hash), and drives a `Scheduler` that holds the tile queue and posts one tile at a
time to a pool of render workers. A separate reference worker computes the arbitrary-precision
reference orbit (`bigfloat.ts`, `reference.ts`) and the bilinear-approximation table (`bla.ts`)
into SharedArrayBuffers that all render workers read. Render workers run `perturb.ts`, which
iterates each pixel as a double-precision offset from the reference with rebasing and BLA skips,
and return smooth iteration values. The main thread colours them (`palette.ts`) and paints
progressive passes on the canvas (`canvas.ts`), showing an instant transform of the previous
frame during gestures. Start reading at `spec.md`, then `main.ts`, then `scheduler.ts`.

## Things the agent gets wrong

Add a line the second time an agent makes the same mistake.

## Lifecycle

Read and follow `.gravity/policy.md`.
Lifecycle conventions: `docs/sdlc/conventions.md`.

When using superpowers: write design specs to `docs/changes/{date}-{slug}/spec.md` and
implementation plans to `docs/changes/{date}-{slug}/plan.md`, not to `docs/superpowers/`. Before
brainstorming a change that is not an exact mechanical change, check for an
accepted intent at `docs/changes/{date}-{slug}/intent.md` and capture one first if absent. A
design answering an intent includes the sections in
`docs/changes/_templates/spec-sections.md`. Code review follows
`REVIEW.md`.
