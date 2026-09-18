---
title: Mandelbrot fractal generator and viewer
author: Bill Little
status: closed
date: 2026-09-18
intent: docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/intent.md
design: docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md
plan: docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/plan.md
record: https://github.com/bjlittle/wibble/pull/6
---

# Outcome: Mandelbrot fractal generator and viewer

## Was the intent's outcome reached

Yes, and the design's own check says so rather than a proxy for it.

The intent asked for a custom Mandelbrot generator and viewer whose fractals
display in Chrome. That exists and is merged: `main` at `9e01e2f` serves a
viewer that zooms, pans, recolours and saves, with arbitrary-precision
perturbation and bilinear approximation carrying it well past the depth double
precision alone reaches.

The design's eight-step walkthrough is complete. Steps 1, 2, 5, 6, 7 and 8 are
covered by the Playwright suite. Steps 3 and 4 — sharp detail at a zoom
exponent of at least 25, and a full frame in under ten seconds at an exponent of
at least 60 with the ceiling above 25,000 — need a person at a display, and Bill
Little ran and confirmed both by hand in Chrome on 2026-09-18. Screenshots
inspected during the build agree: the default view, and zoom 10^22.5 with a
200,000 ceiling producing a correct minibrot with spiral arms in 14.5 s.

Steps 3 and 4 are the two the perturbation and bilinear-approximation machinery
exists for, so they are the ones worth re-running by hand after any change to
`perturb.ts`, `bla.ts` or `reference.ts`. When re-running step 4, zoom
interactively into a boundary region rather than pasting a deeper URL: the
32-digit seahorse-valley coordinate in the design is only meaningful to about
10⁻³².

## Evidence

At `9e01e2f`, the merge commit, on the author's machine:

| Command | Result |
|---|---|
| `npm run lint` | silent, exit 0 |
| `npm test` | Test Files 13 passed (13), Tests 115 passed (115) |
| `npm run build` | ✓ built in 86ms; `dist/` lists render-worker and reference-worker assets |
| `npm run test:e2e` | 10 passed |

The manual walkthrough was run separately, against `npm run dev` in Chrome: all
eight steps pass, steps 3 and 4 confirmed by Bill Little on 2026-09-18. The
frame time observed at depth was not captured here, so the design's "under ten
seconds on an eight-core machine" rests on the runner's judgement rather than a
recorded number.

## The chain

| Stage | Artifact |
|---|---|
| Intent | [intent.md](intent.md), raised as issue #1, accepted by #2 and #3 |
| Design | [spec.md](spec.md), merged in #5, amended during the build |
| Plan | [plan.md](plan.md) |
| Build | #6, merged 2026-09-18 |
| Scaffolding | #4, which landed the lifecycle tooling this chain runs under |

## Left open

Out of scope by the design, and unchanged: zoom beyond ~10²⁵⁰, Julia sets,
WebAssembly or GPU, multi-touch, supersampling, animation export, hosting.

Carried forward:

- **Worker error handling — #7.** Three defects in one under-specified design
  decision: a tile that fails its retry stalls its pass and every finer pass;
  the readout never clears once written, so an error outlives the failure
  indefinitely; and the design's reporting sentence does not match the code.
  The behaviour was decided with the owner on 2026-09-18 and is recorded in the
  issue, to land in its own branch.
- **The automatic iteration ceiling under-estimates deep filament regions.**
  The slider override covers it.
- **Eighteen small items** recorded during review, none affecting the image:
  hot-loop micro-costs, dead clamps, unpinned constants in tests.
- **Commit `ac6e529` carries its attribution trailer on the subject line.**
  Rewriting it is the owner's call and nobody has made it.
- **The verification commands are invisible to the gate.** The design's flagged
  concerns record the owner approving the agent to fill `.gravity/verification.md`,
  and the build did fill it — as a table. `scripts/sdlc` looks for lines
  beginning with `- `, so `sdlc doctor` still warns that no verification
  commands are recorded. Resolved for a reader, unresolved for the tooling,
  with lifecycle gates enforced.

## Lessons

**A design sentence that names a quantity needs a test that pins the
quantity.** Decision 6 said a failed tile "is retried once". The code counted
retries per generation and capped them at the pool size, so one tile could be
retried repeatedly while a later tile got none. Both the sentence and the code
passed human review and a full green suite; the disagreement survived until an
automated reviewer read them side by side on #6. The test that now pins it was
written first and watched failing, which is the only reason it is known to
catch the old behaviour.

**Density concentrates defects, and the branch knew where.** The scheduler's
reference-reuse and table-rebuild logic was called out as the weak point before
review found anything. Two independent reviews then each found a reachable
interleaving bug in exactly that state machine. Naming the weak point in
advance was worth more than spreading review attention evenly.

**Some code sits outside every net.** The write-only readout was found by
reading `ui.setStatus` while proposing a fix for something else — not by a
test, because `AGENTS.md` scopes DOM code to the Playwright suite and Playwright
cannot induce a worker crash from the page. Worth knowing that the error-path
UI in this repository is inspection-only, and saying so rather than assuming
coverage.

**A self-calibrated test has a floor.** The deep bilinear-approximation
agreement test measures against the region's own chaotic sensitivity, so it
catches gross errors but cannot see a subtle regression inside that noise band.
It is a smoke alarm, not a thermometer.

**Numbers pinned in prose cost maintenance.** The healthy test count is quoted
in both `AGENTS.md` and `.gravity/verification.md`. Adding two tests made both
stale in the same commit that added them, and it took a deliberate pass to
notice. Anyone changing the suite size pays that toll twice.

**The lifecycle had no home for this note.** The chain named an outcome and
`docs/changes/README.md` named the file, but the policy's Documents table had
no row for it, so #6 carried the evidence and the lessons in its pull request
body. That is fixed in the same change that adds this record: the table gained
a `Records` row and the policy declares records adopted.
