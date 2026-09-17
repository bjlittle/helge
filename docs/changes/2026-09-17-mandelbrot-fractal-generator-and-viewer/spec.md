# Design: Mandelbrot fractal generator and viewer

## Intent

Answers [intent.md](intent.md), status `accepted` (merged in
[#3](https://github.com/bjlittle/wibble/pull/3), tracked by
[#1](https://github.com/bjlittle/wibble/issues/1)).

The intent's open questions were settled by the originator on 2026-09-17:
"view" means a seamless, intuitive, interactive experience with zoom, pan,
recolouring and saving; the viewer is served from a static localhost. During
design the originator raised the zoom requirement to extreme depth.

No organisation policy skills are installed in this repository, so this design
carries no policy overlays beyond the repository's own lifecycle rules.

## Decisions

1. **Browser-only application in TypeScript, served by the Vite dev server on
   localhost, no backend.** The intent constrains display to Chrome and
   hosting to a static localhost. Everything, including the fractal maths,
   runs in the page.

2. **Rendering on the CPU in Web Workers, not on the GPU.** Extreme zoom needs
   64-bit floating point and arbitrary-precision integers, neither of which
   WebGL or WebGPU shaders provide. Workers keep the main thread free for
   input, and pure TypeScript maths is unit-testable where shaders are not.
   Nothing heavier than colouring a buffer runs on the main thread.

3. **Perturbation with a single reference orbit and rebasing.** One reference
   orbit is computed in arbitrary precision at a reference point near the
   view centre. Each pixel iterates its offset from that reference in ordinary
   doubles: with reference `Z` and offset `δ`,
   `δ[n+1] = 2·Z[n]·δ[n] + δ[n]² + δ₀`, and the pixel's value is
   `z[n] = Z[n] + δ[n]`. When `|z[n]| < |δ[n]|`, or when the reference orbit
   runs out, the pixel rebases: `δ ← z` and the reference index restarts at
   zero. Rebasing removes the glitch artefacts that older tools patched with
   secondary reference orbits, so one reference suffices.

4. **Bilinear approximation (BLA) to skip iterations.** Where `δ` is small
   enough that `δ²` is negligible, a run of iterations collapses to
   `δ ← A·δ + B·δ₀`. A table of such steps is built from the reference orbit
   in a binary tree: a level-0 node at iteration `l` is
   `A = 2·Z[l]`, `B = 1`, radius `r = ε·|Z[l]|` with `ε = 2⁻²⁴`, computed on
   the fly and not stored; two consecutive nodes `x` then `y` merge to
   `A = A_y·A_x`, `B = A_y·B_x + B_y`,
   `r = min(r_x, max(0, (r_y − |B_x|·|δ₀|max) / |A_x|))`, and levels 1 and up
   are stored. At iteration `n` with offset `δ`, the pixel takes the largest
   stored node starting at `n` whose radius exceeds `|δ|`, or a single
   perturbation step if none qualifies. Without BLA a frame at a deep
   minibrot needing a hundred thousand iterations per pixel takes minutes;
   with it, seconds. This is the largest and riskiest piece of work.

5. **Arbitrary precision by BigInt fixed point, no library.** A value is a
   BigInt mantissa with a shared count of fractional bits. Precision for a
   view is `precisionBits(scale) = max(128, ceil(−log₂ scale) + 64)`, where
   `scale` is complex units per CSS pixel. BigInt multiplication in V8 is fast
   enough to compute a reference of a million iterations in seconds, and the
   reference is computed in chunks of 4,096 iterations so progress can be
   reported and cancellation observed between chunks.

6. **One dedicated reference worker plus a pool of render workers.** The
   reference worker computes the reference orbit and builds the BLA table.
   Every reference request carries an `id`; results for an `id` the scheduler
   no longer wants are dropped. If a newer request arrives while one is in
   flight, the scheduler terminates the reference worker and starts a fresh
   one, which is the only reliable way to abandon BigInt work promptly. The
   render pool has `navigator.hardwareConcurrency − 1` workers, minimum 1.

7. **Reference orbit and BLA table in SharedArrayBuffers.** All render
   workers read one copy instead of each holding their own. Chrome only
   exposes SharedArrayBuffer to cross-origin-isolated pages, so the Vite
   server sets `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp`. The page is still a static
   localhost, but a bare `python -m http.server` will not serve it. The
   originator accepted this during design review.

8. **Reference length and reuse.** A reference is computed to
   `refLength = min(2²², nextPow2(ceiling))` iterations, giving headroom so
   zooming in does not force a recompute at every step. A reference is reused
   for a new view while all three hold: the reference point lies within four
   view half-diagonals of the new centre; the required ceiling does not
   exceed `ref.capacity`, the length that was requested, so an early-escaping
   reference is not needlessly recomputed; and
   `ref.bits ≥ precisionBits(view.scale)`. The BLA
   table is rebuilt, in the reference worker, when a view's `|δ₀|max` exceeds
   the bound the table was built for. Small pans and zooms therefore
   recompute pixels only.

9. **Scheduler-owned queue, one tile per idle worker.** Worker message queues
   are first-in first-out, so a cancel message posted behind a batch of
   tiles would only be read once every stale tile had been computed. The
   scheduler therefore holds the tile queue itself and posts exactly one tile
   to each idle render worker; on a view change it clears its queue, and the
   at most one in-flight tile per worker is the only stale work that
   completes. There is no cancel message for tiles.

10. **Progressive rendering with generation cancellation and an interim
    transform.** Every view change increments a generation counter. The
    canvas immediately redraws the last available bitmap translated and
    scaled to the new view, so the image follows the cursor without waiting.
    The scheduler renders passes at strides 8, 4, 2 and 1 CSS pixels, and a
    final pass at the device pixel ratio when it exceeds 1, splitting each
    pass into 64×64 tiles. Tile results carrying a stale generation are
    discarded on arrival. Each pass is painted as it completes. Passes
    recompute every pixel; the redundancy is about one third of the final
    pass and is accepted for simplicity.

11. **Workers return smooth iteration values, not colours.** Each pixel's
    result is a smooth escape-time value `ν = n − log₂(ln|z[n]| / ln R)` with
    bailout radius `R = 256`, or −1 for interior points. Colouring happens on
    the main thread from the cached buffer, so changing palette, density or
    offset recolours instantly with no recompute.

12. **Colouring by cyclic gradient over a log-scaled iteration value, with
    user-adjustable density.** A palette is a named list of colour stops
    expanded into a 4,096-entry lookup table. The colour index is
    `t = (density · log₂(1 + ν) + offset) mod 1`. Both `density` and `offset`
    are view state, adjustable from the toolbar and stored in the hash.
    Density is needed because at depth `ν` varies by a small relative amount
    across a frame, and a fixed density would collapse the view to one hue.
    Interior is black. The initial palettes are: classic (blue, white,
    orange, black), fire, ice, grayscale and a high-contrast rainbow.

13. **Iteration ceiling scales with depth, clamped, user-overridable.** The
    zoom exponent is `e = log₁₀(4 / (scale · widthCss))`, so the default view
    has `e = 0`. The automatic ceiling is
    `autoMaxIter = clamp(round(1000 + 400·e), 200, 2²²)`. The user can
    override it from the toolbar on a log-scale slider, clamped to the same
    range, or return to automatic. Zoom-out is limited to `e ≥ −1`. The cap
    of 2²² (4,194,304) bounds shared memory: 16 bytes per iteration for the
    reference and 40 for the BLA table, so at most about 235 MB.

14. **View state lives in the URL hash, written carefully.** The hash holds
    centre (two decimal strings), scale, iteration ceiling or `auto`,
    palette id, density and offset. The first change of a gesture calls
    `history.pushState`; further changes within 150 ms of the last input
    call `history.replaceState` on that entry, so one gesture is one
    back-button step, the pre-gesture view survives as the previous entry,
    and Chrome's history-update throttle is never tripped. The app records
    the hash it wrote and ignores any `hashchange` that matches it. An empty
    or invalid hash arriving from the back button means the default view. `fromHash` validates every field and returns `null`, falling back
    to `DEFAULT_VIEW`, when any is missing or out of range. The hash grows to
    a few hundred characters at extreme depth, which is acceptable.

15. **Default view is numeric.** `DEFAULT_VIEW` is centre `−0.5 + 0i`,
    `scale = 4 / widthCss`, `maxIter: 'auto'`, palette `classic`,
    density 1, offset 0.

16. **Input mapping.** Wheel zooms about the cursor by
    `1.1 ** (deltaPx / 100)`, where `deltaPx` normalises `deltaMode` lines to
    16 px and pages to the viewport height, clamped per event to between a
    quarter and four times; this keeps mouse notches, trackpad scrolls and
    Ctrl+wheel pinch at the same rate. Pointer drag pans. Double-click zooms
    in by 2 about the point. Keys: arrows pan by a tenth of the viewport,
    `+` and `−` zoom by 2 about the centre, `R` resets to the default view,
    `S` saves, `?` toggles the help overlay, `Esc` closes it.

17. **Save is a PNG of the canvas at the rendered resolution.** The toolbar
    button or `S` calls `canvas.toBlob` and downloads
    `mandelbrot-e<exponent>-<hash8>.png`, where `<hash8>` is the first eight
    hex digits of a hash of the centre strings, so the name stays short at
    any depth. The full view is recoverable from the URL, not the filename.

18. **Toolbar and readout.** A compact overlay holds: palette select, density
    and offset sliders, iteration slider with an automatic toggle, reset,
    save and help buttons. A readout shows centre (truncated to 12
    significant digits), zoom as a power of ten, iteration ceiling and last
    render time. A progress bar appears while a reference orbit is being
    computed. The help overlay lists the input mapping.

19. **A plain double-precision renderer is kept as the test oracle, compared
    only where comparison is meaningful.** A pixel escaping at iteration `n`
    amplifies rounding differences by roughly `2ⁿ`, so past about thirty
    iterations the perturbation path and the plain path legitimately differ
    and no pixel-level assertion can hold. The oracle test therefore renders
    a frame at zoom exponent 8 in an exterior region where every pixel
    escapes within thirty iterations and requires agreement within 10⁻⁶ in
    `ν`; this still proves the perturbation arithmetic is exact across eight
    orders of magnitude of zoom. Deeper correctness is established by the
    BLA consistency test and by the visual checks in Verification, where
    precision loss shows as unmistakable noise or blocks.

20. **Practical zoom limit around 10²⁵⁰.** Beyond that the pixel offsets fall
    below the double exponent range. Going further needs an extended-exponent
    number type and is out of scope.

21. **Toolchain: TypeScript 5, Vite, Vitest, Playwright, ESLint.** Vite is the
    static server and bundler and sets the headers in decision 7. Vitest runs
    unit tests on the pure modules. One Playwright spec runs the page in
    Chromium and exercises the main interactions. ESLint with
    typescript-eslint and `tsc --noEmit` form the lint step. TypeScript stays
    on the 5.x line because typescript-eslint does not yet support 7.

22. **Staged delivery.** The plan lands a correct image at any depth first
    (decisions 3, 5, 6, 7, 8), then BLA (decision 4) to make it fast, then
    polish. Landing correctness before speed de-risks the hardest piece.

## Files and interfaces

### Layout

```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts
playwright.config.ts  eslint.config.js  index.html
src/
  main.ts            wires modules together; owns the render loop
  styles.css
  bigfloat.ts        BigInt fixed-point real and complex arithmetic (pure)
  mandelbrot.ts      plain double-precision iteration; test oracle (pure)
  reference.ts       arbitrary-precision reference orbit, chunked (pure)
  bla.ts             build and query the bilinear approximation table (pure)
  perturb.ts         per-pixel perturbation with rebasing and BLA (pure)
  viewport.ts        view state, pixel↔complex mapping, hash round trip (pure)
  palette.ts         iteration values to RGBA, palette definitions (pure)
  scheduler.ts       worker pool, tile queue, passes, generation cancellation
  render-worker.ts   Web Worker entry: tile jobs
  reference-worker.ts Web Worker entry: reference and BLA jobs
  worker-scope.ts    minimal typing of a worker's global scope
  filename.ts        short PNG download name (pure)
  canvas.ts          paints buffers; interim transform of the last bitmap
  input.ts           pointer, wheel and keyboard events to viewport actions
  history.ts         hash writes with replace/push and self-event suppression
  ui.ts              toolbar, readout, progress bar, help overlay
tests/               one Vitest file per pure module, plus scheduler.ts and
                     history.ts with fakes; canvas, input and ui are exercised
                     by the Playwright spec
e2e/viewer.spec.ts   Playwright: load, wheel zoom, drag pan, palette, reset
```

### Interfaces others depend on

**Fixed-point numbers** (`bigfloat.ts`).

```ts
interface Fixed { m: bigint; bits: number }          // value = m / 2^bits
interface BigComplex { re: Fixed; im: Fixed }
fromNumber(x: number, bits: number): Fixed;  toNumber(x: Fixed): number
fromDecimal(s: string, bits: number): Fixed; toDecimal(x: Fixed): string
add, sub, mul, sqr, neg(a: Fixed, b?: Fixed): Fixed;  cmpAbs(a, b): number
rebits(x: Fixed, bits: number): Fixed
cadd, csub, cmul(a: BigComplex, b: BigComplex): BigComplex
csqr(a: BigComplex): BigComplex;  cnorm2(a: BigComplex): number  // |a|² as double
```

`BigComplex` values are structured-cloneable and are posted to workers as is.

**View state** (`viewport.ts`).

```ts
interface ViewState {
  centre: BigComplex;      // high precision
  scale: number;           // complex units per CSS pixel
  maxIter: number | 'auto';
  palette: string;         // palette id
  density: number;         // colour cycles per doubling of ν, in [0.05, 20]
  offset: number;          // colour cycling offset in [0, 1)
}
const MIN_ITER = 200, MAX_ITER = 2 ** 22, MIN_EXPONENT = -1
const DENSITY_MIN = 0.05, DENSITY_MAX = 20, SCALE_MIN = 1e-260, SCALE_MAX = 1
precisionBits(scale: number): number
zoomExponent(view, widthCss): number
autoMaxIter(view, widthCss): number            // clamped
effectiveMaxIter(view, widthCss): number       // override or auto, clamped
refLength(ceiling: number): number             // min(MAX_ITER, nextPow2), at least 2
maxScaleFor(widthCss): number                  // the scale at MIN_EXPONENT
defaultView(widthCss: number): ViewState       // centre −0.5+0i, scale 4/widthCss
pixelOffset(view, px, py, widthCss, heightCss): { re; im }
                                               // complex offset of a CSS pixel centre from the view centre
zoomAbout(view, px, py, factor, widthCss, heightCss): ViewState  // respects MIN_EXPONENT
pan(view, dxPx, dyPx): ViewState
offsetFrom(origin: BigComplex, view: ViewState): { re: number; im: number }
                                               // view.centre − origin as doubles
halfDiagonal(view, widthCss, heightCss): number
passGeometry(view, refCentre, stepCss, widthCss, heightCss): { originRe; originIm; step }
                                               // δ₀ of the centre of pass pixel (0,0) relative to
                                               // refCentre, and the complex size of one pass pixel
sameGeometry(a: ViewState, b: ViewState): boolean   // centre, scale and maxIter unchanged
toHash(view): string
fromHash(hash: string): ViewState | null
   // null on any malformed, missing or out-of-range field; maxIter, density
   // and offset are clamped rather than rejected; the palette id is only
   // checked for shape, and main.ts substitutes 'classic' for an unknown id
```

**Reference orbit** (`reference.ts`).

```ts
interface ReferenceOrbit {
  z: Float64Array;         // interleaved re, im; SharedArrayBuffer-backed
  length: number;          // iterations actually stored, at least 2
  capacity: number;        // iterations requested; reuse compares against this
  escaped: boolean;        // reference left the bailout before capacity
  centre: BigComplex;
  bits: number;
}
computeReference(centre: BigComplex, length: number, bits: number,
                 out: Float64Array, onChunk: (done: number) => boolean)
                 : { length: number; escaped: boolean; aborted: boolean }
// onChunk returns false to abort; called every 4,096 iterations.
// length is at least 2 so Z[0] = 0 and Z[1] = C are always present.
toRefMeta(ref: ReferenceOrbit, buffer: SharedArrayBuffer): SharedRefMeta
fromRefMeta(meta: SharedRefMeta): ReferenceOrbit
```

**BLA table** (`bla.ts`).

```ts
interface BlaTable {
  levels: number;          // L, the deepest stored level
  length: number;          // reference length the table was built for
  offsets: number[];       // offsets[k] = index of level k's first node
  nodes: Float64Array;     // levels 1..L; per node A.re, A.im, B.re, B.im, r
  delta0Max: number;       // |δ₀| bound the radii were built for
}
blaLevels(refLength: number): number
blaNodeCount(refLength: number): number
buildBla(ref: ReferenceOrbit, delta0Max: number, out: Float64Array): BlaTable
lookupLevel(table: BlaTable, m: number, deltaAbs2: number): number
      // level k ≥ 1 of the largest node starting at m with r² > deltaAbs2
      // and m + 2^k < table.length; 0 when none. Allocation-free.
nodeOffset(table: BlaTable, k: number, m: number): number
      // index into nodes of that node's five doubles
toBlaMeta(table: BlaTable, buffer: SharedArrayBuffer): SharedBlaMeta
fromBlaMeta(meta: SharedBlaMeta, refLength: number): BlaTable
```

**Per-pixel iteration** (`perturb.ts`).

```ts
interface TileJob {
  generation: number; pass: number;
  x: number; y: number; w: number; h: number;   // in pass pixels
  originRe: number; originIm: number;           // δ₀ of pass pixel (0,0)
  step: number;                                 // complex units per pass pixel
  maxIter: number;
}
iteratePixel(ref, bla: BlaTable | null, d0re, d0im, maxIter): number   // ν or −1
renderTile(ref, bla: BlaTable | null, job: TileJob, out: Float32Array): void
perturbStats: { steps: number; skips: number }   // counters for tests and the readout
```

**Plain oracle** (`mandelbrot.ts`).

```ts
iterateDouble(cre: number, cim: number, maxIter: number): number       // ν or −1
```

**Worker protocol** (`scheduler.ts` ↔ workers).

```ts
// reference-worker.ts
type ToReferenceWorker =
  | { type: 'compute'; id: number; centre: BigComplex; length: number;
      bits: number; delta0Max: number }
  | { type: 'rebuildBla'; id: number; delta0Max: number }   // reuses held ref
type FromReferenceWorker =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'done'; id: number; ref: SharedRefMeta; bla: SharedBlaMeta }

// render-worker.ts
type ToRenderWorker =
  | { type: 'setShared'; ref: SharedRefMeta; bla: SharedBlaMeta | null }
  | { type: 'tile'; job: TileJob }
type FromRenderWorker =
  | { type: 'tile'; job: TileJob; data: Float32Array }      // transferred

interface SharedRefMeta { buffer: SharedArrayBuffer; length: number; capacity: number;
                          escaped: boolean; centre: BigComplex; bits: number }
interface SharedBlaMeta { buffer: SharedArrayBuffer; levels: number;
                          delta0Max: number }
```

The scheduler posts one `tile` to a render worker only when that worker has
no tile outstanding, and drops results whose `job.generation` is stale.

**History** (`history.ts`).

```ts
createHistory(onExternalChange: (hash: string) => void): {
  write(hash: string, mode: 'replace' | 'push'): void;   // records own writes
  dispose(): void;
}
```

**Palette** (`palette.ts`).

```ts
interface Palette { id: string; name: string;
                    stops: [t: number, r: number, g: number, b: number][] }
PALETTES: Palette[]
colourise(values: Float32Array, palette: Palette, density: number,
          offset: number, out: Uint8ClampedArray): void
```

### Verification commands to record

`package.json` defines these scripts; the plan adds them to the Commands
section of `AGENTS.md` and to `.gravity/verification.md`.

```
npm run build       vite build
npm run lint        eslint . && tsc --noEmit
npm test            vitest run
npm run test:e2e    playwright test
npm run dev         vite (the static localhost the intent asks for)
```

## Out of scope

- Zoom beyond about 10²⁵⁰; extended-exponent arithmetic.
- Julia sets, other fractals, or alternative iteration formulas.
- WebAssembly or GPU acceleration.
- Multi-touch gestures; Ctrl+wheel covers trackpad pinch.
- Supersampling or anti-aliasing beyond device pixel ratio rendering.
- Reusing coarse-pass pixels in finer passes.
- Animation, zoom video export, or keyframe paths.
- Hosting, deployment, or any use beyond the local dev server.
- Distance estimation, orbit traps, or colouring modes beyond smooth
  escape time.
- Persisting state anywhere other than the URL hash.

## Flagged concerns

| Concern | Policy area | Owner | Resolution |
|---|---|---|---|
| The lifecycle names `.gravity/verification.md` as the source of verification commands, but it records none yet, and the policy reserves `.gravity/policy.md` for human edits without saying who edits the rest of `.gravity`. | Lifecycle, verification | Bill Little | Resolved: the owner approved on 2026-09-17 that the agent edits `.gravity/verification.md` directly. The build pull request adds the commands to both `AGENTS.md` and `.gravity/verification.md`. |
| Enforced lifecycle gates could not run on pull requests while the SDLC scaffolding was untracked on `main`. | Lifecycle gates | Bill Little | Resolved: the scaffolding landed on `main` in [#4](https://github.com/bjlittle/wibble/pull/4) on 2026-09-17, before the build pull request. |
| SharedArrayBuffer needs COOP and COEP headers, so the intent's "static localhost" must be the Vite server rather than any static file server. | Intent constraint | Bill Little | Resolved: accepted by the owner in design review on 2026-09-17 (decision 7). |

## Verification

The end-to-end check that shows the intent's outcome was reached, run in
Chrome against `npm run dev`:

1. Open `http://localhost:5173/`. The full Mandelbrot set renders within one
   second and sharpens progressively.
2. Scroll to zoom about the cursor and drag to pan. The image follows the
   cursor immediately and re-renders progressively with no blank frames. The
   back button steps through gestures, not individual wheel events.
3. Zoom into the boundary until the readout shows a zoom exponent of at least
   25. Detail stays sharp and free of blocky or noisy regions. A progress bar
   appears while the reference orbit computes and disappears when done.
4. Continue to a zoom exponent of at least 60 near a minibrot, with the
   ceiling above 25,000. A full-resolution frame completes in under ten
   seconds on an eight-core machine. This exercises bilinear approximation.
5. Change the palette and drag the density and offset sliders. Colours change
   with no recompute delay, and detail at depth can be recovered by raising
   density.
6. Press `S`. A PNG of the current view downloads with a short filename and
   opens correctly.
7. Copy the URL, open it in a new tab. The identical view renders.
8. Press `R`. The default view returns.

Automated checks, all passing:

- `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`.
- Unit tests include: over a frame at zoom exponent 8 in an exterior region
  where every pixel escapes within thirty iterations, the perturbation
  renderer agrees with the plain double-precision oracle within 10⁻⁶ in `ν`
  at every pixel; individual quickly-escaping points, including ones whose
  reference orbit escapes early and forces rebasing, agree within 10⁻⁶;
  BLA-skipped results agree with step-by-step perturbation to a relative
  10⁻⁴ for random offsets inside each node's radius; `zoomAbout` leaves the point under the cursor fixed and
  respects the zoom-out limit; `autoMaxIter` is clamped at both ends;
  `toHash` and `fromHash` round-trip at 300 bits and `fromHash` rejects
  malformed, out-of-range and oversized input; `fromDecimal` and
  `toDecimal` round-trip; the scheduler posts at most one tile per worker,
  clears its queue on a view change and discards stale tiles, using a fake
  worker; `createHistory` ignores its own writes and forwards external ones;
  `colourise` output stays within bounds and is periodic in `offset`.
- The Playwright spec loads the page, waits for a non-blank canvas, then:
  dispatches a wheel event and asserts the hash changed; drags and asserts
  the centre changed; selects another palette and asserts pixels changed
  without the hash's centre changing; presses `R` and asserts the hash
  matches the default view.

## Status

Living. Last confirmed current: 2026-09-17.
