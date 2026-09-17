# Mandelbrot fractal generator and viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only Mandelbrot viewer served from a Vite dev server that zooms interactively to extreme depth using perturbation, rebasing and bilinear approximation, with recolouring, PNG save and URL-restorable views.

**Architecture:** Pure TypeScript maths modules (fixed-point BigInt, reference orbit, perturbation, bilinear approximation, viewport, palette) are driven by a main-thread scheduler that owns a tile queue and posts one tile at a time to a pool of render workers, plus one reference worker that computes the arbitrary-precision reference orbit and the BLA table into SharedArrayBuffers. The canvas shows an instant transform of the previous frame while progressive passes sharpen the image. View state lives in the URL hash.

**Tech Stack:** TypeScript 5.9, Vite 8, Vitest 5, Playwright 1.63, ESLint 10 with typescript-eslint 8. No runtime dependencies.

**Spec:** `docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md` — read it first; every task below cites the decision it implements.

## Global Constraints

- Node ≥ 22.12 (the machine has 24.19). Dev dependencies pinned: `typescript ~5.9.3`, `vite ^8.3.0`, `vitest ^5.0.1`, `@playwright/test ^1.63.0`, `eslint ^10.10.0`, `typescript-eslint ^8.70.0`, `@eslint/js ^10.0.1`. No `dependencies`, only `devDependencies`. TypeScript stays on 5.x (spec decision 21).
- TypeScript `strict`, target ES2022. Worker entry files must not add the `WebWorker` lib; they cast `self` to a local minimal type (see Task 10).
- Pure modules (`bigfloat`, `mandelbrot`, `reference`, `bla`, `perturb`, `viewport`, `palette`, `filename`) import nothing from the DOM and have no side effects at import.
- Constants, verbatim from the spec: bailout radius `256`; BLA `ε = 2 ** -24`; reference chunk `4096`; `MIN_ITER = 200`; `MAX_ITER = 2 ** 22`; `MIN_EXPONENT = -1`; tile `64`; pass strides `8, 4, 2, 1` CSS px plus a device-pixel-ratio pass when DPR > 1; wheel factor `1.1 ** (deltaPx / 100)` clamped to `[0.25, 4]`; gesture end `150 ms`; palette LUT `4096`; `precisionBits(scale) = max(128, ceil(-log2(scale)) + 64)`; `autoMaxIter = clamp(round(1000 + 400·e), 200, 2**22)` with `e = log10(4 / (scale · widthCss))`; `refLength = min(2**22, nextPow2(ceiling))`; reference reuse within `4` half-diagonals, `need ≤ capacity`, `bits ≥ needed`; a new reference is built for `|δ₀|max = 2 × half-diagonal`.
- The dev and preview servers send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (decision 7).
- Git: the repository policy forbids commits and branch creation unless the user asks. The user must authorise, before Task 1 starts, the creation of branch `feat/mandelbrot-viewer` and the per-task commits in this plan. Never push, amend or rebase without asking. Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before reporting any task complete, run the verification commands that exist at that point (`npm run lint`, `npm test`, and from Task 11 `npm run test:e2e`, and `npm run build`) and paste their output. Never skip or delete a failing test.
- Tests live in `tests/*.test.ts` (Vitest, Node environment) and `e2e/viewer.spec.ts` (Playwright, Chromium). Tests import from `../src/...`.

---

## Task map

| # | Deliverable | Spec decisions |
|---|---|---|
| 1 | Toolchain scaffold; lint, test, build all green | 1, 7, 21 |
| 2 | `bigfloat.ts` fixed-point arithmetic and decimal round trip | 5 |
| 3 | `mandelbrot.ts` double-precision oracle and smooth colouring value | 11, 19 |
| 4 | `viewport.ts` view state, mapping, zoom, pan, geometry | 13, 15, 16 |
| 5 | `viewport.ts` hash serialise, parse and validate | 14 |
| 6 | `reference.ts` chunked arbitrary-precision reference orbit | 3, 5, 8 |
| 7 | `perturb.ts` per-pixel perturbation with rebasing, tile renderer | 3, 19 |
| 8 | `palette.ts` palettes, LUT, colourise | 12 |
| 9 | `scheduler.ts` worker pool, tile queue, passes, reference reuse | 6, 8, 9, 10 |
| 10 | `history.ts` hash writes; `filename.ts` PNG name | 14, 17 |
| 11 | Workers, `canvas.ts`, first visible render, Playwright load test | 2, 6, 7, 10 |
| 12 | `input.ts`, hash wiring, Playwright zoom/pan/reset/back | 13, 14, 16 |
| 13 | `ui.ts` toolbar, readout, progress, help, save; Playwright palette/save | 12, 17, 18 |
| 14 | `bla.ts` table build and lookup | 4 |
| 15 | BLA integrated into perturbation, workers and scheduler | 4, 8 |
| 16 | `AGENTS.md`, `.gravity/verification.md`, `README.md` | Files and interfaces |
| 17 | Final verification and hand-over | Verification |

Tasks 1 to 13 deliver a correct image at any depth (stage one). Tasks 14 and 15 deliver speed at depth (stage two). Tasks 16 and 17 close out (decision 22).

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `index.html`, `src/main.ts`, `src/styles.css`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `lint`, `test`, `test:e2e` that every later task runs.

- [ ] **Step 1: Create the branch (user authorisation obtained per Global Constraints)**

```bash
git switch -c feat/mandelbrot-viewer
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
test-results/
playwright-report/
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "wibble-mandelbrot",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint . && tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.63.0",
    "eslint": "^10.10.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.70.0",
    "vite": "^8.3.0",
    "vitest": "^5.0.1"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 5: Write `vite.config.ts` (decision 7 headers)**

```ts
import { defineConfig } from 'vite';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { port: 5173, strictPort: true, headers: isolation },
  preview: { port: 5173, strictPort: true, headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 7: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    viewport: { width: 800, height: 600 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 8: Write `eslint.config.js`**

```js
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
);
```

- [ ] **Step 9: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mandelbrot</title>
  </head>
  <body>
    <canvas id="view"></canvas>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 10: Write placeholder `src/main.ts` and `src/styles.css`**

`src/main.ts`:
```ts
import './styles.css';

export {};
```

`src/styles.css`:
```css
html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #000;
  color: #ddd;
  font: 13px system-ui, sans-serif;
}
#view {
  display: block;
  position: fixed;
  inset: 0;
  cursor: grab;
  touch-action: none;
}
#view:active { cursor: grabbing; }
```

- [ ] **Step 11: Write `tests/smoke.test.ts` (deleted in Task 2)**

```ts
import { expect, it } from 'vitest';

it('runs the test runner', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 12: Install**

```bash
npm install
npx playwright install chromium
```
Expected: `added N packages` with no `ERESOLVE` errors; Playwright reports the Chromium build present or downloads it.

- [ ] **Step 13: Run the three commands that exist**

```bash
npm run lint
npm test
npm run build
```
Expected: lint prints nothing after the two sub-commands and exits 0; test prints `Test Files  1 passed` and `Tests  1 passed`; build prints `✓ built in` and lists `dist/index.html` and one JS asset.

- [ ] **Step 14: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts eslint.config.js index.html src/main.ts src/styles.css tests/smoke.test.ts
git commit -m "chore: scaffold TypeScript, Vite, Vitest, Playwright and ESLint" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Fixed-point BigInt arithmetic (`bigfloat.ts`)

**Files:**
- Create: `src/bigfloat.ts`
- Test: `tests/bigfloat.test.ts`
- Delete: `tests/smoke.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Fixed { readonly m: bigint; readonly bits: number }        // value = m / 2^bits
  interface BigComplex { readonly re: Fixed; readonly im: Fixed }
  zero(bits): Fixed; czero(bits): BigComplex; bitLength(m: bigint): number
  fromNumber(x: number, bits: number): Fixed;  toNumber(x: Fixed): number
  fromDecimal(s: string, bits: number): Fixed; toDecimal(x: Fixed): string
  add, sub, mul(a: Fixed, b: Fixed): Fixed; sqr, neg, shl1(a: Fixed): Fixed
  cmpAbs(a: Fixed, b: Fixed): -1 | 0 | 1; rebits(x: Fixed, bits): Fixed
  cadd, csub, cmul(a: BigComplex, b: BigComplex): BigComplex; csqr(a): BigComplex
  crebits(a: BigComplex, bits): BigComplex; cnorm2(a): number
  cfromNumbers(re: number, im: number, bits): BigComplex; ctoNumbers(a): { re: number; im: number }
  ```
  All binary operations require equal `bits` and throw `RangeError` otherwise.

- [ ] **Step 1: Write the failing tests**

`tests/bigfloat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  add, cadd, cfromNumbers, cmpAbs, csqr, ctoNumbers, fromDecimal, fromNumber, mul,
  rebits, sub, toDecimal, toNumber, type Fixed,
} from '../src/bigfloat';

describe('fromNumber / toNumber', () => {
  it('round-trips doubles whose bits fit the precision', () => {
    for (const x of [0, 1, -1, 0.5, -0.75, 1.5, 3.25, 1e-10, 123456.789, -2.5e-30]) {
      expect(toNumber(fromNumber(x, 256))).toBe(x);
    }
  });

  it('truncates values below the resolution to zero', () => {
    expect(toNumber(fromNumber(1e-100, 128))).toBe(0);
  });

  it('handles mantissas wider than 64 bits', () => {
    const x = fromNumber(1.5, 512);
    expect(x.m).toBe(3n << 511n);
    expect(toNumber(x)).toBe(1.5);
  });

  it('handles tiny values at high precision', () => {
    const x = fromNumber(2 ** -800, 900);
    expect(x.m).toBe(1n << 100n);
    expect(toNumber(x)).toBe(2 ** -800);
  });

  it('rejects non-finite input', () => {
    expect(() => fromNumber(NaN, 64)).toThrow(RangeError);
    expect(() => fromNumber(Infinity, 64)).toThrow(RangeError);
  });
});

describe('decimal strings', () => {
  it('parses and formats simple values', () => {
    expect(toDecimal(fromDecimal('-0.5', 8))).toBe('-0.5');
    expect(toDecimal(fromDecimal('2', 8))).toBe('2');
    expect(toDecimal(fromDecimal('0', 8))).toBe('0');
    expect(toDecimal(fromDecimal('.25', 8))).toBe('0.25');
    expect(toDecimal(fromDecimal('+1.75', 8))).toBe('1.75');
  });

  it('round-trips arbitrary mantissas at 300 bits', () => {
    const bits = 300;
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let i = 0; i < 50; i++) {
      let m = 0n;
      for (let k = 0; k < 10; k++) m = (m << 31n) | BigInt(rnd());
      if (rnd() & 1) m = -m;
      const x: Fixed = { m, bits };
      expect(fromDecimal(toDecimal(x), bits)).toEqual(x);
    }
  });

  it('rejects malformed input', () => {
    for (const s of ['', '.', 'abc', '1e5', '1.2.3', '--1', '1,5']) {
      expect(() => fromDecimal(s, 64)).toThrow(SyntaxError);
    }
  });
});

describe('arithmetic', () => {
  const bits = 64;
  const f = (x: number) => fromNumber(x, bits);

  it('adds, subtracts and multiplies', () => {
    expect(toNumber(add(f(1.5), f(2.25)))).toBe(3.75);
    expect(toNumber(sub(f(1.5), f(2.25)))).toBe(-0.75);
    expect(toNumber(mul(f(1.5), f(-2.5)))).toBe(-3.75);
  });

  it('squares and adds complex numbers', () => {
    const z = cfromNumbers(1, 2, bits);
    expect(ctoNumbers(csqr(z))).toEqual({ re: -3, im: 4 });
    expect(ctoNumbers(cadd(z, z))).toEqual({ re: 2, im: 4 });
  });

  it('rebits preserves the value in both directions', () => {
    expect(toNumber(rebits(f(0.375), 200))).toBe(0.375);
    expect(toNumber(rebits(f(0.375), 8))).toBe(0.375);
    expect(rebits(f(0.375), 64)).toEqual(f(0.375));
  });

  it('cmpAbs compares magnitudes', () => {
    expect(cmpAbs(f(-3), f(2))).toBe(1);
    expect(cmpAbs(f(1), f(-1))).toBe(0);
    expect(cmpAbs(f(0.5), f(-2))).toBe(-1);
  });

  it('throws on mismatched precision', () => {
    expect(() => add(f(1), fromNumber(1, 32))).toThrow(RangeError);
    expect(() => mul(f(1), fromNumber(1, 32))).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
rm tests/smoke.test.ts
npx vitest run tests/bigfloat.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/bigfloat"`.

- [ ] **Step 3: Write `src/bigfloat.ts`**

```ts
/** Fixed-point real number: value = m / 2^bits. All operands of a binary op share `bits`. */
export interface Fixed {
  readonly m: bigint;
  readonly bits: number;
}

export interface BigComplex {
  readonly re: Fixed;
  readonly im: Fixed;
}

export function zero(bits: number): Fixed {
  return { m: 0n, bits };
}

export function czero(bits: number): BigComplex {
  return { re: zero(bits), im: zero(bits) };
}

export function bitLength(m: bigint): number {
  if (m < 0n) m = -m;
  return m === 0n ? 0 : m.toString(2).length;
}

function sameBits(a: Fixed, b: Fixed): void {
  if (a.bits !== b.bits) throw new RangeError(`precision mismatch: ${a.bits} vs ${b.bits}`);
}

/** Exact conversion of a finite double: decomposes the IEEE mantissa and exponent. */
export function fromNumber(x: number, bits: number): Fixed {
  if (!Number.isFinite(x)) throw new RangeError(`fromNumber: ${x}`);
  if (x === 0) return { m: 0n, bits };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp: number;
  if (biased === 0) {
    exp = -1074;
  } else {
    mant |= 1n << 52n;
    exp = biased - 1075;
  }
  const shift = exp + bits;
  const m = shift >= 0 ? mant << BigInt(shift) : mant >> BigInt(-shift);
  return { m: negative ? -m : m, bits };
}

/** 2^e without intermediate overflow or underflow for |e| up to about 2000. */
function pow2(e: number): number {
  const h = Math.trunc(e / 2);
  return 2 ** h * 2 ** (e - h);
}

export function toNumber(x: Fixed): number {
  if (x.m === 0n) return 0;
  const negative = x.m < 0n;
  let m = negative ? -x.m : x.m;
  const drop = Math.max(0, bitLength(m) - 64);
  if (drop > 0) m >>= BigInt(drop);
  const v = Number(m) * pow2(drop - x.bits);
  return negative ? -v : v;
}

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** Parses a plain decimal string ("-0.5", "2", ".25") to the nearest fixed-point value. */
export function fromDecimal(s: string, bits: number): Fixed {
  const match = DECIMAL.exec(s.trim());
  if (!match) throw new SyntaxError(`fromDecimal: ${JSON.stringify(s)}`);
  const sign = match[1];
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? '';
  if (intPart === '' && fracPart === '') throw new SyntaxError(`fromDecimal: ${JSON.stringify(s)}`);
  const digits = BigInt((intPart || '0') + fracPart);
  const scale = 10n ** BigInt(fracPart.length);
  const q = ((digits << BigInt(bits)) + scale / 2n) / scale;
  return { m: sign === '-' ? -q : q, bits };
}

/** Formats with enough digits that fromDecimal(toDecimal(x), x.bits) is exact. */
export function toDecimal(x: Fixed): string {
  const digits = Math.ceil(x.bits * Math.log10(2)) + 1;
  const negative = x.m < 0n;
  const m = negative ? -x.m : x.m;
  const half = x.bits > 0 ? 1n << BigInt(x.bits - 1) : 0n;
  const scaled = (m * 10n ** BigInt(digits) + half) >> BigInt(x.bits);
  const text = scaled.toString().padStart(digits + 1, '0');
  const intPart = text.slice(0, text.length - digits);
  const fracPart = text.slice(text.length - digits).replace(/0+$/, '');
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative && scaled !== 0n ? `-${body}` : body;
}

export function add(a: Fixed, b: Fixed): Fixed {
  sameBits(a, b);
  return { m: a.m + b.m, bits: a.bits };
}

export function sub(a: Fixed, b: Fixed): Fixed {
  sameBits(a, b);
  return { m: a.m - b.m, bits: a.bits };
}

export function mul(a: Fixed, b: Fixed): Fixed {
  sameBits(a, b);
  return { m: (a.m * b.m) >> BigInt(a.bits), bits: a.bits };
}

export function sqr(a: Fixed): Fixed {
  return { m: (a.m * a.m) >> BigInt(a.bits), bits: a.bits };
}

export function neg(a: Fixed): Fixed {
  return { m: -a.m, bits: a.bits };
}

export function shl1(a: Fixed): Fixed {
  return { m: a.m << 1n, bits: a.bits };
}

export function cmpAbs(a: Fixed, b: Fixed): -1 | 0 | 1 {
  sameBits(a, b);
  const x = a.m < 0n ? -a.m : a.m;
  const y = b.m < 0n ? -b.m : b.m;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function rebits(x: Fixed, bits: number): Fixed {
  if (bits === x.bits) return x;
  const d = bits - x.bits;
  return { m: d > 0 ? x.m << BigInt(d) : x.m >> BigInt(-d), bits };
}

export function crebits(a: BigComplex, bits: number): BigComplex {
  return { re: rebits(a.re, bits), im: rebits(a.im, bits) };
}

export function cadd(a: BigComplex, b: BigComplex): BigComplex {
  return { re: add(a.re, b.re), im: add(a.im, b.im) };
}

export function csub(a: BigComplex, b: BigComplex): BigComplex {
  return { re: sub(a.re, b.re), im: sub(a.im, b.im) };
}

export function cmul(a: BigComplex, b: BigComplex): BigComplex {
  return {
    re: sub(mul(a.re, b.re), mul(a.im, b.im)),
    im: add(mul(a.re, b.im), mul(a.im, b.re)),
  };
}

export function csqr(a: BigComplex): BigComplex {
  return { re: sub(sqr(a.re), sqr(a.im)), im: shl1(mul(a.re, a.im)) };
}

export function cnorm2(a: BigComplex): number {
  const r = toNumber(a.re);
  const i = toNumber(a.im);
  return r * r + i * i;
}

export function cfromNumbers(re: number, im: number, bits: number): BigComplex {
  return { re: fromNumber(re, bits), im: fromNumber(im, bits) };
}

export function ctoNumbers(a: BigComplex): { re: number; im: number } {
  return { re: toNumber(a.re), im: toNumber(a.im) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/bigfloat.test.ts
```
Expected: PASS, 13 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/bigfloat.ts tests/bigfloat.test.ts
git rm -q tests/smoke.test.ts
git commit -m "feat: BigInt fixed-point real and complex arithmetic" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Double-precision oracle (`mandelbrot.ts`)

**Files:**
- Create: `src/mandelbrot.ts`
- Test: `tests/mandelbrot.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const BAILOUT = 256; const BAILOUT2 = 65536;
  smoothNu(n: number, zAbs2: number): number          // ν = n − log2(ln|z| / ln R)
  iterateDouble(cre: number, cim: number, maxIter: number): number   // ν, or −1 for interior
  ```
  Convention used everywhere: at iteration `n` the value `z[n]` is tested against the bailout *before* stepping; `z[0] = 0`. So `ν ∈ (n − 1, n]` where `n` is the first index with `|z[n]| > 256`.

- [ ] **Step 1: Write the failing tests**

`tests/mandelbrot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BAILOUT, BAILOUT2, iterateDouble, smoothNu } from '../src/mandelbrot';

/** Independent escape-iteration count using the same convention as the module. */
function escapeIndex(cre: number, cim: number, maxIter: number): number {
  let zr = 0, zi = 0;
  for (let n = 0; n < maxIter; n++) {
    if (zr * zr + zi * zi > BAILOUT2) return n;
    const t = zr * zr - zi * zi + cre;
    zi = 2 * zr * zi + cim;
    zr = t;
  }
  return -1;
}

describe('smoothNu', () => {
  it('is n exactly when |z| = R and n − 1 when |z| = R²', () => {
    expect(smoothNu(10, BAILOUT * BAILOUT)).toBeCloseTo(10, 10);
    expect(smoothNu(10, BAILOUT ** 4)).toBeCloseTo(9, 10);
  });

  it('decreases as |z| grows', () => {
    expect(smoothNu(5, 70000)).toBeGreaterThan(smoothNu(5, 90000));
  });
});

describe('iterateDouble', () => {
  it('reports interior points as −1', () => {
    expect(iterateDouble(0, 0, 1000)).toBe(-1);
    expect(iterateDouble(-1, 0, 1000)).toBe(-1);
    expect(iterateDouble(-0.1, 0.75, 1000)).toBe(-1);
  });

  it('gives ν in (n − 1, n] for escaping points', () => {
    for (const [cre, cim] of [[1, 0], [0.5, 0.5], [-1.5, 0.5], [0.3, -0.6], [-2.1, 0]]) {
      const n = escapeIndex(cre, cim, 1000);
      expect(n).toBeGreaterThan(0);
      const nu = iterateDouble(cre, cim, 1000);
      expect(nu).toBeGreaterThan(n - 1);
      expect(nu).toBeLessThanOrEqual(n);
    }
  });

  it('escapes c = 1 at iteration 5', () => {
    expect(Math.ceil(iterateDouble(1, 0, 100))).toBe(5);
  });

  it('is symmetric under conjugation', () => {
    expect(iterateDouble(-0.75, 0.3, 500)).toBe(iterateDouble(-0.75, -0.3, 500));
  });

  it('returns −1 when maxIter is reached even for slow escapers', () => {
    expect(iterateDouble(-0.75, 0.01, 5)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/mandelbrot.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/mandelbrot"`.

- [ ] **Step 3: Write `src/mandelbrot.ts`**

```ts
export const BAILOUT = 256;
export const BAILOUT2 = BAILOUT * BAILOUT;
const LN_BAILOUT = Math.log(BAILOUT);

/** Smooth escape-time value ν = n − log2(ln|z| / ln R), given |z|². */
export function smoothNu(n: number, zAbs2: number): number {
  return n - Math.log2((0.5 * Math.log(zAbs2)) / LN_BAILOUT);
}

/** Plain double-precision escape-time iteration. Test oracle and shallow-zoom reference. */
export function iterateDouble(cre: number, cim: number, maxIter: number): number {
  let zr = 0;
  let zi = 0;
  for (let n = 0; n < maxIter; n++) {
    const zr2 = zr * zr;
    const zi2 = zi * zi;
    const abs2 = zr2 + zi2;
    if (abs2 > BAILOUT2) return smoothNu(n, abs2);
    zi = 2 * zr * zi + cim;
    zr = zr2 - zi2 + cre;
  }
  return -1;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/mandelbrot.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/mandelbrot.ts tests/mandelbrot.test.ts
git commit -m "feat: double-precision Mandelbrot oracle with smooth colouring value" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: View state and geometry (`viewport.ts`, part 1)

**Files:**
- Create: `src/viewport.ts`
- Test: `tests/viewport.test.ts`

**Interfaces:**
- Consumes: `bigfloat.ts` (`BigComplex`, `cfromNumbers`, `crebits`, `csub`, `ctoNumbers`, `fromNumber`, `add`).
- Produces:
  ```ts
  const MIN_ITER = 200, MAX_ITER = 2 ** 22, MIN_EXPONENT = -1
  const DENSITY_MIN = 0.05, DENSITY_MAX = 20, SCALE_MIN = 1e-260, SCALE_MAX = 1
  interface ViewState { centre: BigComplex; scale: number; maxIter: number | 'auto'; palette: string; density: number; offset: number }
  clamp(x, lo, hi): number
  precisionBits(scale): number
  zoomExponent(view, widthCss): number
  autoMaxIter(view, widthCss): number
  effectiveMaxIter(view, widthCss): number
  refLength(ceiling): number
  maxScaleFor(widthCss): number                       // most zoomed-out scale allowed
  defaultView(widthCss): ViewState
  pixelOffset(view, px, py, widthCss, heightCss): { re; im }   // complex offset of a CSS pixel centre from the view centre
  zoomAbout(view, px, py, factor, widthCss, heightCss): ViewState
  pan(view, dxPx, dyPx): ViewState
  offsetFrom(origin: BigComplex, view): { re; im }            // view.centre − origin as doubles
  halfDiagonal(view, widthCss, heightCss): number
  passGeometry(view, refCentre, stepCss, widthCss, heightCss): { originRe; originIm; step }
     // δ₀ of the centre of pass pixel (0,0) relative to refCentre, and complex size of one pass pixel
  sameGeometry(a: ViewState, b: ViewState): boolean          // centre, scale and maxIter unchanged
  ```

- [ ] **Step 1: Write the failing tests**

`tests/viewport.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ctoNumbers, toNumber } from '../src/bigfloat';
import {
  autoMaxIter, defaultView, effectiveMaxIter, halfDiagonal, MAX_ITER, maxScaleFor, MIN_ITER,
  offsetFrom, pan, passGeometry, pixelOffset, precisionBits, refLength, sameGeometry,
  zoomAbout, zoomExponent, type ViewState,
} from '../src/viewport';

const W = 800;
const H = 600;

function pointAt(view: ViewState, px: number, py: number): { re: number; im: number } {
  const c = ctoNumbers(view.centre);
  const o = pixelOffset(view, px, py, W, H);
  return { re: c.re + o.re, im: c.im + o.im };
}

describe('precision and iteration policy', () => {
  it('precisionBits has a floor of 128 and adds 64 bits of margin', () => {
    expect(precisionBits(1)).toBe(128);
    expect(precisionBits(2 ** -100)).toBe(164);
    expect(precisionBits(2 ** -200)).toBe(264);
  });

  it('default view has zoom exponent 0 and 1000 iterations', () => {
    const v = defaultView(W);
    expect(zoomExponent(v, W)).toBeCloseTo(0, 12);
    expect(autoMaxIter(v, W)).toBe(1000);
    expect(ctoNumbers(v.centre)).toEqual({ re: -0.5, im: 0 });
    expect(v.maxIter).toBe('auto');
    expect(v.palette).toBe('classic');
    expect(v.density).toBe(1);
    expect(v.offset).toBe(0);
  });

  it('autoMaxIter grows with depth and is clamped at both ends', () => {
    const v = defaultView(W);
    expect(autoMaxIter({ ...v, scale: v.scale / 1e8 }, W)).toBe(4200);
    expect(autoMaxIter({ ...v, scale: v.scale * 100 }, W)).toBe(MIN_ITER);
    expect(autoMaxIter({ ...v, scale: v.scale / 1e200 }, W)).toBe(81000);
  });

  it('effectiveMaxIter honours and clamps overrides', () => {
    const v = defaultView(W);
    expect(effectiveMaxIter({ ...v, maxIter: 50 }, W)).toBe(MIN_ITER);
    expect(effectiveMaxIter({ ...v, maxIter: 1e9 }, W)).toBe(MAX_ITER);
    expect(effectiveMaxIter({ ...v, maxIter: 3000 }, W)).toBe(3000);
    expect(effectiveMaxIter(v, W)).toBe(1000);
  });

  it('refLength is the next power of two, capped, and at least 2', () => {
    expect(refLength(1)).toBe(2);
    expect(refLength(200)).toBe(256);
    expect(refLength(256)).toBe(256);
    expect(refLength(257)).toBe(512);
    expect(refLength(MAX_ITER + 1)).toBe(MAX_ITER);
  });
});

describe('zoom and pan', () => {
  it('zoomAbout keeps the point under the cursor fixed', () => {
    const v = defaultView(W);
    const before = pointAt(v, 100, 50);
    const z = zoomAbout(v, 100, 50, 3, W, H);
    expect(z.scale).toBeCloseTo(v.scale / 3, 15);
    const after = pointAt(z, 100, 50);
    expect(after.re).toBeCloseTo(before.re, 12);
    expect(after.im).toBeCloseTo(before.im, 12);
  });

  it('zoomAbout raises the centre precision as scale shrinks', () => {
    let v = defaultView(W);
    for (let i = 0; i < 30; i++) v = zoomAbout(v, 400, 300, 10, W, H);
    expect(v.scale).toBeCloseTo(defaultView(W).scale / 1e30, 40);
    expect(v.centre.re.bits).toBeGreaterThanOrEqual(precisionBits(v.scale));
  });

  it('zoomAbout refuses to zoom out past MIN_EXPONENT', () => {
    const v = defaultView(W);
    const out = zoomAbout(v, 400, 300, 1 / 1000, W, H);
    expect(out.scale).toBe(maxScaleFor(W));
    expect(zoomExponent(out, W)).toBeCloseTo(-1, 12);
    expect(zoomAbout(out, 10, 10, 0.5, W, H)).toBe(out);
  });

  it('pan moves the centre against the drag', () => {
    const v = defaultView(W);
    const p = pan(v, 80, 60);
    expect(toNumber(p.centre.re)).toBeCloseTo(-0.5 - 80 * v.scale, 15);
    expect(toNumber(p.centre.im)).toBeCloseTo(60 * v.scale, 15);
    expect(pan(v, 0, 0)).toBe(v);
  });

  it('sameGeometry ignores colour fields', () => {
    const v = defaultView(W);
    expect(sameGeometry(v, { ...v, palette: 'fire', density: 3, offset: 0.2 })).toBe(true);
    expect(sameGeometry(v, pan(v, 1, 0))).toBe(false);
    expect(sameGeometry(v, { ...v, maxIter: 5000 })).toBe(false);
  });
});

describe('geometry relative to a reference', () => {
  it('offsetFrom returns view.centre − origin', () => {
    const v = defaultView(W);
    const p = pan(v, 80, -60);
    const d = offsetFrom(v.centre, p);
    expect(d.re).toBeCloseTo(-80 * v.scale, 15);
    expect(d.im).toBeCloseTo(-60 * v.scale, 15);
  });

  it('halfDiagonal is half the viewport diagonal in complex units', () => {
    const v = defaultView(W);
    expect(halfDiagonal(v, W, H)).toBeCloseTo(0.5 * Math.hypot(W, H) * v.scale, 15);
  });

  it('passGeometry gives the top-left pass pixel centre and the pass step', () => {
    const v = defaultView(W);
    const g = passGeometry(v, v.centre, 8, W, H);
    expect(g.step).toBeCloseTo(8 * v.scale, 15);
    expect(g.originRe).toBeCloseTo((4 - W / 2) * v.scale, 15);
    expect(g.originIm).toBeCloseTo(-(4 - H / 2) * v.scale, 15);
    const shifted = pan(v, 80, 0);
    const g2 = passGeometry(shifted, v.centre, 8, W, H);
    expect(g2.originRe).toBeCloseTo(g.originRe - 80 * v.scale, 15);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/viewport.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/viewport"`.

- [ ] **Step 3: Write `src/viewport.ts`**

```ts
import {
  add, cfromNumbers, crebits, csub, ctoNumbers, fromNumber, type BigComplex,
} from './bigfloat';

export const MIN_ITER = 200;
export const MAX_ITER = 2 ** 22;
export const MIN_EXPONENT = -1;
export const DENSITY_MIN = 0.05;
export const DENSITY_MAX = 20;
export const SCALE_MIN = 1e-260;
export const SCALE_MAX = 1;

export interface ViewState {
  readonly centre: BigComplex;
  readonly scale: number; // complex units per CSS pixel
  readonly maxIter: number | 'auto';
  readonly palette: string;
  readonly density: number;
  readonly offset: number;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function precisionBits(scale: number): number {
  return Math.max(128, Math.ceil(-Math.log2(scale)) + 64);
}

export function zoomExponent(view: ViewState, widthCss: number): number {
  return Math.log10(4 / (view.scale * widthCss));
}

export function autoMaxIter(view: ViewState, widthCss: number): number {
  return clamp(Math.round(1000 + 400 * zoomExponent(view, widthCss)), MIN_ITER, MAX_ITER);
}

export function effectiveMaxIter(view: ViewState, widthCss: number): number {
  if (view.maxIter === 'auto') return autoMaxIter(view, widthCss);
  return clamp(Math.round(view.maxIter), MIN_ITER, MAX_ITER);
}

export function refLength(ceiling: number): number {
  let p = 2;
  while (p < ceiling) p *= 2;
  return Math.min(MAX_ITER, p);
}

/** The largest scale (most zoomed out) permitted: zoom exponent MIN_EXPONENT. */
export function maxScaleFor(widthCss: number): number {
  return 4 / (widthCss * 10 ** MIN_EXPONENT);
}

export function defaultView(widthCss: number): ViewState {
  const scale = 4 / widthCss;
  return {
    centre: cfromNumbers(-0.5, 0, precisionBits(scale)),
    scale,
    maxIter: 'auto',
    palette: 'classic',
    density: 1,
    offset: 0,
  };
}

/** Complex offset of the centre of CSS pixel (px, py) from the view centre. Screen y points down. */
export function pixelOffset(
  view: ViewState, px: number, py: number, widthCss: number, heightCss: number,
): { re: number; im: number } {
  return { re: (px - widthCss / 2) * view.scale, im: -(py - heightCss / 2) * view.scale };
}

function shiftCentre(centre: BigComplex, dre: number, dim: number, bits: number): BigComplex {
  const c = crebits(centre, bits);
  return { re: add(c.re, fromNumber(dre, bits)), im: add(c.im, fromNumber(dim, bits)) };
}

/** Zoom by `factor` (> 1 zooms in) keeping the complex point under (px, py) fixed. */
export function zoomAbout(
  view: ViewState, px: number, py: number, factor: number, widthCss: number, heightCss: number,
): ViewState {
  const target = clamp(view.scale / factor, SCALE_MIN, maxScaleFor(widthCss));
  if (target === view.scale) return view;
  const off = pixelOffset(view, px, py, widthCss, heightCss);
  const ratio = target / view.scale;
  const bits = precisionBits(target);
  return {
    ...view,
    scale: target,
    centre: shiftCentre(view.centre, off.re * (1 - ratio), off.im * (1 - ratio), bits),
  };
}

/** Pan so the content follows a drag of (dxPx, dyPx) CSS pixels. */
export function pan(view: ViewState, dxPx: number, dyPx: number): ViewState {
  if (dxPx === 0 && dyPx === 0) return view;
  return {
    ...view,
    centre: shiftCentre(view.centre, -dxPx * view.scale, dyPx * view.scale, view.centre.re.bits),
  };
}

/** view.centre − origin, as doubles. Exact in BigInt before the final conversion. */
export function offsetFrom(origin: BigComplex, view: ViewState): { re: number; im: number } {
  const bits = Math.max(origin.re.bits, view.centre.re.bits);
  return ctoNumbers(csub(crebits(view.centre, bits), crebits(origin, bits)));
}

export function halfDiagonal(view: ViewState, widthCss: number, heightCss: number): number {
  return 0.5 * Math.hypot(widthCss, heightCss) * view.scale;
}

/**
 * Geometry of a progressive pass with `stepCss` CSS pixels per pass pixel:
 * δ₀ of the centre of pass pixel (0, 0) relative to `refCentre`, and the complex size of a pass pixel.
 */
export function passGeometry(
  view: ViewState, refCentre: BigComplex, stepCss: number, widthCss: number, heightCss: number,
): { originRe: number; originIm: number; step: number } {
  const d = offsetFrom(refCentre, view);
  return {
    originRe: d.re + (0.5 * stepCss - widthCss / 2) * view.scale,
    originIm: d.im - (0.5 * stepCss - heightCss / 2) * view.scale,
    step: stepCss * view.scale,
  };
}

export function sameGeometry(a: ViewState, b: ViewState): boolean {
  return a.scale === b.scale && a.maxIter === b.maxIter
    && a.centre.re.bits === b.centre.re.bits
    && a.centre.re.m === b.centre.re.m && a.centre.im.m === b.centre.im.m;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/viewport.test.ts
```
Expected: PASS, 13 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/viewport.ts tests/viewport.test.ts
git commit -m "feat: view state, precision policy, zoom and pan geometry" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Hash serialisation and validation (`viewport.ts`, part 2)

**Files:**
- Modify: `src/viewport.ts` (append)
- Test: `tests/viewport-hash.test.ts`

**Interfaces:**
- Consumes: `bigfloat.ts` (`fromDecimal`, `toDecimal`, `toNumber`).
- Produces:
  ```ts
  toHash(view: ViewState): string              // "#re=…&im=…&s=…&i=…&p=…&d=…&o=…"
  fromHash(hash: string): ViewState | null     // null on malformed, missing or out-of-range fields
  ```
  Rules (decision 14): `re`/`im` are plain decimals of at most 400 characters with |value| ≤ 4; `s` finite in `[SCALE_MIN, SCALE_MAX]`; `i` is `auto` or a number, clamped to `[MIN_ITER, MAX_ITER]`; `p` matches `/^[a-z0-9-]{1,32}$/` (an unknown id is substituted by `main.ts`); `d` clamped to `[DENSITY_MIN, DENSITY_MAX]`; `o` reduced modulo 1. Centre precision is `precisionBits(s)`.

- [ ] **Step 1: Write the failing tests**

`tests/viewport-hash.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fromDecimal } from '../src/bigfloat';
import {
  DENSITY_MAX, defaultView, fromHash, MAX_ITER, MIN_ITER, precisionBits, toHash, type ViewState,
} from '../src/viewport';

const W = 800;

function withParam(hash: string, key: string, value: string | null): string {
  const p = new URLSearchParams(hash.slice(1));
  if (value === null) p.delete(key); else p.set(key, value);
  return '#' + p.toString();
}

describe('toHash / fromHash', () => {
  it('round-trips the default view', () => {
    const v = defaultView(W);
    const h = toHash(v);
    expect(h.startsWith('#')).toBe(true);
    expect(fromHash(h)).toEqual(v);
  });

  it('round-trips a deep view at 300 bits', () => {
    const scale = 2 ** -236;
    const bits = precisionBits(scale);
    expect(bits).toBe(300);
    const v: ViewState = {
      centre: {
        re: fromDecimal('-0.74364388703715870475219150611477', bits),
        im: fromDecimal('0.13182590420531197049313205638514', bits),
      },
      scale,
      maxIter: 50000,
      palette: 'fire',
      density: 2.5,
      offset: 0.125,
    };
    expect(fromHash(toHash(v))).toEqual(v);
  });

  it('accepts a hash without the leading #', () => {
    const v = defaultView(W);
    expect(fromHash(toHash(v).slice(1))).toEqual(v);
  });

  it('rejects empty, missing and malformed fields', () => {
    const h = toHash(defaultView(W));
    expect(fromHash('')).toBeNull();
    expect(fromHash('#')).toBeNull();
    for (const key of ['re', 'im', 's', 'i', 'p', 'd', 'o']) {
      expect(fromHash(withParam(h, key, null))).toBeNull();
    }
    expect(fromHash(withParam(h, 're', 'abc'))).toBeNull();
    expect(fromHash(withParam(h, 're', '1e-3'))).toBeNull();
    expect(fromHash(withParam(h, 'im', '.5'))).toBeNull();
    expect(fromHash(withParam(h, 'i', 'many'))).toBeNull();
    expect(fromHash(withParam(h, 'd', 'NaN'))).toBeNull();
    expect(fromHash(withParam(h, 'o', 'Infinity'))).toBeNull();
  });

  it('rejects out-of-range scale and far-away centres', () => {
    const h = toHash(defaultView(W));
    expect(fromHash(withParam(h, 's', '0'))).toBeNull();
    expect(fromHash(withParam(h, 's', '-1'))).toBeNull();
    expect(fromHash(withParam(h, 's', '2'))).toBeNull();
    expect(fromHash(withParam(h, 's', '1e-300'))).toBeNull();
    expect(fromHash(withParam(h, 're', '10'))).toBeNull();
    expect(fromHash(withParam(h, 'im', '-4.5'))).toBeNull();
  });

  it('rejects oversized centres and bad palette ids', () => {
    const h = toHash(defaultView(W));
    expect(fromHash(withParam(h, 're', '0.' + '1'.repeat(500)))).toBeNull();
    expect(fromHash(withParam(h, 'p', 'Fire'))).toBeNull();
    expect(fromHash(withParam(h, 'p', 'a b'))).toBeNull();
    expect(fromHash(withParam(h, 'p', ''))).toBeNull();
    expect(fromHash(withParam(h, 'p', 'unknown-id'))?.palette).toBe('unknown-id');
  });

  it('clamps iterations, density and offset instead of rejecting', () => {
    const h = toHash(defaultView(W));
    expect(fromHash(withParam(h, 'i', '5'))?.maxIter).toBe(MIN_ITER);
    expect(fromHash(withParam(h, 'i', '1e12'))?.maxIter).toBe(MAX_ITER);
    expect(fromHash(withParam(h, 'i', '2500.4'))?.maxIter).toBe(2500);
    expect(fromHash(withParam(h, 'd', '100'))?.density).toBe(DENSITY_MAX);
    expect(fromHash(withParam(h, 'o', '1.25'))?.offset).toBeCloseTo(0.25, 12);
    expect(fromHash(withParam(h, 'o', '-0.25'))?.offset).toBeCloseTo(0.75, 12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/viewport-hash.test.ts
```
Expected: FAIL with `toHash is not a function` or `fromHash is not a function`.

- [ ] **Step 3: Append to `src/viewport.ts`**

Add to the import line: `fromDecimal, toDecimal, toNumber`. Then append:

```ts
const HASH_DECIMAL = /^-?\d+(\.\d+)?$/;
const HASH_PALETTE = /^[a-z0-9-]{1,32}$/;
const MAX_CENTRE_CHARS = 400;
const MAX_HASH_CHARS = 2000;
const MAX_CENTRE_ABS = 4;

export function toHash(view: ViewState): string {
  const p = new URLSearchParams();
  p.set('re', toDecimal(view.centre.re));
  p.set('im', toDecimal(view.centre.im));
  p.set('s', String(view.scale));
  p.set('i', view.maxIter === 'auto' ? 'auto' : String(view.maxIter));
  p.set('p', view.palette);
  p.set('d', String(view.density));
  p.set('o', String(view.offset));
  return '#' + p.toString();
}

/** Parses and validates a hash. Returns null when any field is missing, malformed or out of range. */
export function fromHash(hash: string): ViewState | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length === 0 || text.length > MAX_HASH_CHARS) return null;
  const p = new URLSearchParams(text);
  const re = p.get('re');
  const im = p.get('im');
  const s = p.get('s');
  const i = p.get('i');
  const pal = p.get('p');
  const d = p.get('d');
  const o = p.get('o');
  if (re === null || im === null || s === null || i === null || pal === null || d === null || o === null) {
    return null;
  }
  if (re.length > MAX_CENTRE_CHARS || im.length > MAX_CENTRE_CHARS) return null;
  if (!HASH_DECIMAL.test(re) || !HASH_DECIMAL.test(im)) return null;
  const scale = Number(s);
  if (!Number.isFinite(scale) || scale < SCALE_MIN || scale > SCALE_MAX) return null;
  let maxIter: number | 'auto';
  if (i === 'auto') {
    maxIter = 'auto';
  } else {
    const n = Number(i);
    if (!Number.isFinite(n)) return null;
    maxIter = clamp(Math.round(n), MIN_ITER, MAX_ITER);
  }
  if (!HASH_PALETTE.test(pal)) return null;
  const density = Number(d);
  const offset = Number(o);
  if (!Number.isFinite(density) || !Number.isFinite(offset)) return null;
  const bits = precisionBits(scale);
  const centre: BigComplex = { re: fromDecimal(re, bits), im: fromDecimal(im, bits) };
  if (Math.abs(toNumber(centre.re)) > MAX_CENTRE_ABS || Math.abs(toNumber(centre.im)) > MAX_CENTRE_ABS) {
    return null;
  }
  return {
    centre,
    scale,
    maxIter,
    palette: pal,
    density: clamp(density, DENSITY_MIN, DENSITY_MAX),
    offset: offset - Math.floor(offset),
  };
}
```

- [ ] **Step 4: Run all viewport tests to verify they pass**

```bash
npx vitest run tests/viewport.test.ts tests/viewport-hash.test.ts
```
Expected: PASS, 20 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/viewport.ts tests/viewport-hash.test.ts
git commit -m "feat: URL hash serialisation with validation and clamping" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Arbitrary-precision reference orbit (`reference.ts`)

**Files:**
- Create: `src/reference.ts`
- Test: `tests/reference.test.ts`

**Interfaces:**
- Consumes: `bigfloat.ts` (`BigComplex`, `cadd`, `crebits`, `csqr`, `czero`, `toNumber`); `mandelbrot.ts` (`BAILOUT2`).
- Produces:
  ```ts
  const CHUNK = 4096
  interface ReferenceOrbit { z: Float64Array; length: number; capacity: number; escaped: boolean; centre: BigComplex; bits: number }
     // z is interleaved re, im. length = entries actually stored (≥ 2). capacity = length requested.
  interface SharedRefMeta { buffer: SharedArrayBuffer; length: number; capacity: number; escaped: boolean; centre: BigComplex; bits: number }
  interface ReferenceResult { length: number; escaped: boolean; aborted: boolean }
  computeReference(centre, length, bits, out: Float64Array, onChunk: (done: number) => boolean): ReferenceResult
     // stores Z[0..] into out; calls onChunk every CHUNK iterations; onChunk returning false aborts
  toRefMeta(ref: ReferenceOrbit, buffer: SharedArrayBuffer): SharedRefMeta
  fromRefMeta(meta: SharedRefMeta): ReferenceOrbit
  ```

- [ ] **Step 1: Write the failing tests**

`tests/reference.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cfromNumbers } from '../src/bigfloat';
import { CHUNK, computeReference, fromRefMeta, toRefMeta, type ReferenceOrbit } from '../src/reference';

function orbitDouble(cre: number, cim: number, n: number): number[] {
  const out: number[] = [];
  let zr = 0, zi = 0;
  for (let i = 0; i < n; i++) {
    out.push(zr, zi);
    const t = zr * zr - zi * zi + cre;
    zi = 2 * zr * zi + cim;
    zr = t;
  }
  return out;
}

describe('computeReference', () => {
  it('stores Z[0] = 0, Z[1] = C and stops after the first escaped entry', () => {
    const out = new Float64Array(20);
    const res = computeReference(cfromNumbers(1, 0, 128), 10, 128, out, () => true);
    expect(res).toEqual({ length: 6, escaped: true, aborted: false });
    expect(Array.from(out.subarray(0, 12))).toEqual([0, 0, 1, 0, 2, 0, 5, 0, 26, 0, 677, 0]);
  });

  it('matches the double orbit for the first iterations', () => {
    const out = new Float64Array(80);
    const res = computeReference(cfromNumbers(-0.75, 0.1, 128), 40, 128, out, () => true);
    expect(res.escaped).toBe(false);
    expect(res.length).toBe(40);
    const expected = orbitDouble(-0.75, 0.1, 12);
    for (let i = 0; i < expected.length; i++) expect(out[i]).toBeCloseTo(expected[i], 9);
  });

  it('keeps an interior reference at zero', () => {
    const out = new Float64Array(10);
    const res = computeReference(cfromNumbers(0, 0, 128), 5, 128, out, () => true);
    expect(res).toEqual({ length: 5, escaped: false, aborted: false });
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('reports chunk progress and honours an abort', () => {
    const calls: number[] = [];
    const out = new Float64Array(2 * 9000);
    const res = computeReference(cfromNumbers(-0.1, 0.75, 128), 9000, 128, out, (done) => {
      calls.push(done);
      return true;
    });
    expect(calls).toEqual([CHUNK, 2 * CHUNK]);
    expect(res).toEqual({ length: 9000, escaped: false, aborted: false });

    const aborted = computeReference(cfromNumbers(-0.1, 0.75, 128), 9000, 128, out, () => false);
    expect(aborted).toEqual({ length: CHUNK, escaped: false, aborted: true });
  });

  it('rejects lengths below 2 and undersized output', () => {
    expect(() => computeReference(cfromNumbers(0, 0, 128), 1, 128, new Float64Array(4), () => true)).toThrow(RangeError);
    expect(() => computeReference(cfromNumbers(0, 0, 128), 4, 128, new Float64Array(6), () => true)).toThrow(RangeError);
  });

  it('round-trips through shared metadata', () => {
    const buffer = new SharedArrayBuffer(16 * 8);
    const z = new Float64Array(buffer);
    const centre = cfromNumbers(-0.5, 0, 128);
    const res = computeReference(centre, 8, 128, z, () => true);
    const ref: ReferenceOrbit = { z, length: res.length, capacity: 8, escaped: res.escaped, centre, bits: 128 };
    const back = fromRefMeta(toRefMeta(ref, buffer));
    expect(back.length).toBe(8);
    expect(back.capacity).toBe(8);
    expect(back.centre).toEqual(centre);
    expect(back.z.buffer).toBe(buffer);
    expect(back.z[2]).toBe(-0.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/reference.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/reference"`.

- [ ] **Step 3: Write `src/reference.ts`**

```ts
import { cadd, crebits, csqr, czero, toNumber, type BigComplex } from './bigfloat';
import { BAILOUT2 } from './mandelbrot';

export const CHUNK = 4096;

export interface ReferenceOrbit {
  readonly z: Float64Array; // interleaved re, im
  readonly length: number; // entries stored, at least 2
  readonly capacity: number; // entries requested
  readonly escaped: boolean;
  readonly centre: BigComplex;
  readonly bits: number;
}

export interface SharedRefMeta {
  readonly buffer: SharedArrayBuffer;
  readonly length: number;
  readonly capacity: number;
  readonly escaped: boolean;
  readonly centre: BigComplex;
  readonly bits: number;
}

export interface ReferenceResult {
  readonly length: number;
  readonly escaped: boolean;
  readonly aborted: boolean;
}

/**
 * Computes Z[n+1] = Z[n]² + C in fixed point and stores each Z[n] as doubles into `out`.
 * Stops after storing the first entry beyond the bailout. Calls `onChunk(done)` every
 * CHUNK iterations; a false return aborts.
 */
export function computeReference(
  centre: BigComplex,
  length: number,
  bits: number,
  out: Float64Array,
  onChunk: (done: number) => boolean,
): ReferenceResult {
  if (length < 2) throw new RangeError('reference length must be at least 2');
  if (out.length < 2 * length) throw new RangeError('reference output buffer too small');
  const c = crebits(centre, bits);
  let z = czero(bits);
  for (let n = 0; n < length; n++) {
    const zr = toNumber(z.re);
    const zi = toNumber(z.im);
    out[2 * n] = zr;
    out[2 * n + 1] = zi;
    if (zr * zr + zi * zi > BAILOUT2) return { length: n + 1, escaped: true, aborted: false };
    if (n === length - 1) break;
    z = cadd(csqr(z), c);
    if ((n + 1) % CHUNK === 0 && !onChunk(n + 1)) return { length: n + 1, escaped: false, aborted: true };
  }
  return { length, escaped: false, aborted: false };
}

export function toRefMeta(ref: ReferenceOrbit, buffer: SharedArrayBuffer): SharedRefMeta {
  return {
    buffer, length: ref.length, capacity: ref.capacity, escaped: ref.escaped, centre: ref.centre, bits: ref.bits,
  };
}

export function fromRefMeta(meta: SharedRefMeta): ReferenceOrbit {
  return {
    z: new Float64Array(meta.buffer),
    length: meta.length,
    capacity: meta.capacity,
    escaped: meta.escaped,
    centre: meta.centre,
    bits: meta.bits,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/reference.test.ts
```
Expected: PASS, 6 tests. The chunk test computes 18,000 BigInt iterations at 128 bits and should take well under two seconds.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/reference.ts tests/reference.test.ts
git commit -m "feat: chunked arbitrary-precision reference orbit" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Perturbation with rebasing (`perturb.ts`, no BLA yet)

**Files:**
- Create: `src/perturb.ts`
- Test: `tests/perturb.test.ts`

**Interfaces:**
- Consumes: `mandelbrot.ts` (`BAILOUT2`, `smoothNu`), `reference.ts` (`ReferenceOrbit`).
- Produces (Task 15 later inserts a `bla` parameter after `ref` in both functions):
  ```ts
  interface TileJob {
    generation: number; pass: number;
    x: number; y: number; w: number; h: number;   // tile rectangle in pass pixels
    originRe: number; originIm: number;           // δ₀ of the centre of pass pixel (0,0), relative to the reference
    step: number;                                 // complex units per pass pixel
    maxIter: number;
  }
  iteratePixel(ref: ReferenceOrbit, d0re: number, d0im: number, maxIter: number): number   // ν or −1
  renderTile(ref: ReferenceOrbit, job: TileJob, out: Float32Array): void                    // row-major, out.length ≥ w·h
  ```
  Algorithm (decision 3): `δ ← 2·Z[m]·δ + δ² + δ₀`, `z = Z[m] + δ`. Rebase (`δ ← z`, `m ← 0`) when `|z|² < |δ|²` or when `m` is the last stored reference index. Pass pixel `(x, y)` has `δ₀ = (originRe + x·step, originIm − y·step)`.

- [ ] **Step 1: Write the failing tests**

`tests/perturb.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cfromNumbers, ctoNumbers } from '../src/bigfloat';
import { iterateDouble } from '../src/mandelbrot';
import { iteratePixel, renderTile, type TileJob } from '../src/perturb';
import { computeReference, type ReferenceOrbit } from '../src/reference';
import { autoMaxIter, defaultView, passGeometry, precisionBits, refLength } from '../src/viewport';

function makeRef(cre: number, cim: number, length: number, bits = 128): ReferenceOrbit {
  const z = new Float64Array(2 * length);
  const centre = cfromNumbers(cre, cim, bits);
  const r = computeReference(centre, length, bits, z, () => true);
  return { z, length: r.length, capacity: length, escaped: r.escaped, centre, bits };
}

const QUICK: [number, number][] = [[1, 0], [0.5, 0.5], [-1.5, 0.5], [-2.1, 0], [0, 1.2]];

describe('iteratePixel', () => {
  it('matches the oracle for quick escapers against an interior reference', () => {
    const ref = makeRef(-0.1, 0.75, 512);
    expect(ref.escaped).toBe(false);
    for (const [cre, cim] of QUICK) {
      const expected = iterateDouble(cre, cim, 100);
      expect(expected).toBeGreaterThan(0);
      expect(expected).toBeLessThan(30);
      const actual = iteratePixel(ref, cre - -0.1, cim - 0.75, 100);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
    }
  });

  it('rebases when the reference orbit runs out', () => {
    const ref = makeRef(1, 0, 64);
    expect(ref.escaped).toBe(true);
    expect(ref.length).toBe(6);
    const expected = iterateDouble(0.5, 0.5, 100);
    const actual = iteratePixel(ref, 0.5 - 1, 0.5 - 0, 100);
    expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
    expect(iteratePixel(ref, -1 - 1, 0, 300)).toBe(-1);
  });

  it('reports interior pixels as −1', () => {
    const ref = makeRef(-0.1, 0.75, 1024);
    expect(iteratePixel(ref, 0, 0, 1000)).toBe(-1);
    expect(iteratePixel(ref, 0.1, -0.75, 1000)).toBe(-1);
    expect(iteratePixel(ref, -0.9, -0.75, 1000)).toBe(-1);
  });

  it('is exact for a tiny offset from an exterior reference', () => {
    const ref = makeRef(0.5, 0.5, 64);
    const d0 = 1e-9;
    const expected = iterateDouble(0.5 + d0, 0.5 - d0, 100);
    expect(Math.abs(iteratePixel(ref, d0, -d0, 100) - expected)).toBeLessThan(1e-6);
  });
});

describe('renderTile', () => {
  it('maps pass pixels to the same points as the oracle over the default view', () => {
    const W = 256;
    const view = defaultView(W);
    const ref = makeRef(-0.5, 0, refLength(autoMaxIter(view, W)));
    const geo = passGeometry(view, ref.centre, 8, W, W);
    const job: TileJob = {
      generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32,
      originRe: geo.originRe, originIm: geo.originIm, step: geo.step, maxIter: 1000,
    };
    const out = new Float32Array(32 * 32);
    renderTile(ref, job, out);
    const c = ctoNumbers(ref.centre);
    let checked = 0;
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const expected = iterateDouble(c.re + geo.originRe + px * geo.step, c.im + geo.originIm - py * geo.step, 1000);
        if (expected > 0 && expected < 30) {
          checked++;
          expect(Math.abs(out[py * 32 + px] - expected)).toBeLessThan(1e-4);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('agrees with the oracle across an exterior frame at zoom exponent 8', () => {
    const W = 256;
    const scale = 4 / (W * 1e8);
    const bits = precisionBits(scale);
    const view = { ...defaultView(W), centre: cfromNumbers(0.5, 0.5, bits), scale };
    const maxIter = autoMaxIter(view, W);
    expect(maxIter).toBe(4200);
    const ref = makeRef(0.5, 0.5, refLength(maxIter), bits);
    const geo = passGeometry(view, ref.centre, 8, W, W);
    const job: TileJob = {
      generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32,
      originRe: geo.originRe, originIm: geo.originIm, step: geo.step, maxIter,
    };
    const out = new Float32Array(32 * 32);
    renderTile(ref, job, out);
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const expected = iterateDouble(0.5 + geo.originRe + px * geo.step, 0.5 + geo.originIm - py * geo.step, maxIter);
        expect(expected).toBeGreaterThan(5);
        expect(expected).toBeLessThan(12);
        expect(Math.abs(out[py * 32 + px] - expected)).toBeLessThan(1e-4);
      }
    }
  });

  it('honours the tile offset within a pass', () => {
    const ref = makeRef(-0.5, 0, 1024);
    const view = defaultView(256);
    const geo = passGeometry(view, ref.centre, 8, 256, 256);
    const whole = new Float32Array(32 * 32);
    renderTile(ref, { generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32, ...geo, maxIter: 500 }, whole);
    const part = new Float32Array(8 * 8);
    renderTile(ref, { generation: 0, pass: 0, x: 16, y: 8, w: 8, h: 8, ...geo, maxIter: 500 }, part);
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        expect(part[py * 8 + px]).toBe(whole[(8 + py) * 32 + 16 + px]);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/perturb.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/perturb"`.

- [ ] **Step 3: Write `src/perturb.ts`**

```ts
import { BAILOUT2, smoothNu } from './mandelbrot';
import type { ReferenceOrbit } from './reference';

export interface TileJob {
  readonly generation: number;
  readonly pass: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly originRe: number;
  readonly originIm: number;
  readonly step: number;
  readonly maxIter: number;
}

/**
 * Perturbation iteration of the point c = C + δ₀ against reference orbit Z.
 * δ[n+1] = 2·Z[m]·δ[n] + δ[n]² + δ₀, with z = Z[m] + δ. Rebases (δ ← z, m ← 0) when
 * |z| < |δ| or when the reference orbit has no next entry.
 */
export function iteratePixel(ref: ReferenceOrbit, d0re: number, d0im: number, maxIter: number): number {
  const Z = ref.z;
  const last = ref.length - 1;
  let dre = 0;
  let dim = 0;
  let m = 0;
  for (let n = 0; n < maxIter; n++) {
    let Zre = Z[2 * m];
    let Zim = Z[2 * m + 1];
    const zre = Zre + dre;
    const zim = Zim + dim;
    const z2 = zre * zre + zim * zim;
    if (z2 > BAILOUT2) return smoothNu(n, z2);
    if (m === last || z2 < dre * dre + dim * dim) {
      dre = zre;
      dim = zim;
      m = 0;
      Zre = 0;
      Zim = 0;
    }
    const nre = 2 * (Zre * dre - Zim * dim) + (dre * dre - dim * dim) + d0re;
    const nim = 2 * (Zre * dim + Zim * dre) + 2 * dre * dim + d0im;
    dre = nre;
    dim = nim;
    m++;
  }
  return -1;
}

/** Fills `out` (row-major, w × h) with ν values for the tile described by `job`. */
export function renderTile(ref: ReferenceOrbit, job: TileJob, out: Float32Array): void {
  let i = 0;
  for (let py = 0; py < job.h; py++) {
    const d0im = job.originIm - (job.y + py) * job.step;
    for (let px = 0; px < job.w; px++) {
      out[i++] = iteratePixel(ref, job.originRe + (job.x + px) * job.step, d0im, job.maxIter);
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/perturb.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/perturb.ts tests/perturb.test.ts
git commit -m "feat: perturbation iteration with rebasing and tile renderer" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Palettes and colouring (`palette.ts`)

**Files:**
- Create: `src/palette.ts`
- Test: `tests/palette.test.ts`

**Interfaces:**
- Produces (decision 12):
  ```ts
  const LUT_SIZE = 4096
  interface Palette { id: string; name: string; stops: ReadonlyArray<readonly [t: number, r: number, g: number, b: number]> }
  const PALETTES: readonly Palette[]        // ids: classic, fire, ice, gray, rainbow
  paletteById(id: string): Palette         // falls back to PALETTES[0]
  buildLut(p: Palette): Uint8ClampedArray  // LUT_SIZE × 3
  colourise(values: Float32Array, palette: Palette, density: number, offset: number, out: Uint8ClampedArray): void
     // out is RGBA, 4 × values.length; interior (v < 0) → opaque black; t = frac(density·log2(1 + v) + offset)
  ```

- [ ] **Step 1: Write the failing tests**

`tests/palette.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildLut, colourise, LUT_SIZE, PALETTES, paletteById } from '../src/palette';

describe('PALETTES', () => {
  it('has the five required palettes with valid stops', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['classic', 'fire', 'ice', 'gray', 'rainbow']);
    for (const p of PALETTES) {
      expect(p.stops[0][0]).toBe(0);
      expect(p.stops[p.stops.length - 1][0]).toBe(1);
      for (let i = 1; i < p.stops.length; i++) expect(p.stops[i][0]).toBeGreaterThan(p.stops[i - 1][0]);
    }
  });

  it('paletteById falls back to classic', () => {
    expect(paletteById('fire').id).toBe('fire');
    expect(paletteById('nope').id).toBe('classic');
  });
});

describe('buildLut', () => {
  it('starts at the first stop and interpolates', () => {
    const lut = buildLut(paletteById('gray'));
    expect(lut.length).toBe(LUT_SIZE * 3);
    expect(Array.from(lut.subarray(0, 3))).toEqual([0, 0, 0]);
    const mid = 3 * (LUT_SIZE / 2);
    expect(lut[mid]).toBe(255);
    const quarter = 3 * (LUT_SIZE / 4);
    expect(lut[quarter]).toBeGreaterThan(120);
    expect(lut[quarter]).toBeLessThan(136);
  });
});

describe('colourise', () => {
  const values = new Float32Array([-1, 0.5, 3, 10, 100, 1000]);

  it('paints interior black and exterior opaque', () => {
    const out = new Uint8ClampedArray(values.length * 4);
    colourise(values, paletteById('classic'), 1, 0, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    for (let i = 1; i < values.length; i++) expect(out[4 * i + 3]).toBe(255);
    const nonBlack = Array.from({ length: values.length - 1 }, (_, k) => k + 1)
      .filter((i) => out[4 * i] + out[4 * i + 1] + out[4 * i + 2] > 0);
    expect(nonBlack.length).toBeGreaterThan(0);
  });

  it('is periodic in offset', () => {
    const a = new Uint8ClampedArray(values.length * 4);
    const b = new Uint8ClampedArray(values.length * 4);
    colourise(values, paletteById('rainbow'), 1.3, 0.3, a);
    colourise(values, paletteById('rainbow'), 1.3, 2.3, b);
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(3);
  });

  it('gives every exterior pixel the same colour when density is 0', () => {
    const out = new Uint8ClampedArray(values.length * 4);
    colourise(values, paletteById('fire'), 0, 0.5, out);
    for (let i = 2; i < values.length; i++) {
      expect(Array.from(out.subarray(4 * i, 4 * i + 3))).toEqual(Array.from(out.subarray(4, 7)));
    }
  });

  it('does not throw on NaN and paints it from the first LUT entry', () => {
    const out = new Uint8ClampedArray(4);
    colourise(new Float32Array([NaN]), paletteById('gray'), 1, 0, out);
    expect(Array.from(out)).toEqual([0, 0, 0, 255]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/palette.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/palette"`.

- [ ] **Step 3: Write `src/palette.ts`**

```ts
export const LUT_SIZE = 4096;

export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly stops: ReadonlyArray<readonly [t: number, r: number, g: number, b: number]>;
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'classic',
    name: 'Classic',
    stops: [[0, 0, 7, 100], [0.16, 32, 107, 203], [0.42, 237, 255, 255], [0.6425, 255, 170, 0], [0.8575, 0, 2, 0], [1, 0, 7, 100]],
  },
  {
    id: 'fire',
    name: 'Fire',
    stops: [[0, 0, 0, 0], [0.25, 120, 0, 0], [0.5, 255, 80, 0], [0.75, 255, 220, 80], [1, 0, 0, 0]],
  },
  {
    id: 'ice',
    name: 'Ice',
    stops: [[0, 0, 0, 30], [0.3, 0, 60, 160], [0.6, 120, 200, 255], [0.85, 240, 250, 255], [1, 0, 0, 30]],
  },
  {
    id: 'gray',
    name: 'Grayscale',
    stops: [[0, 0, 0, 0], [0.5, 255, 255, 255], [1, 0, 0, 0]],
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    stops: [[0, 255, 0, 0], [1 / 6, 255, 255, 0], [2 / 6, 0, 255, 0], [3 / 6, 0, 255, 255], [4 / 6, 0, 0, 255], [5 / 6, 255, 0, 255], [1, 255, 0, 0]],
  },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Expands the stops to a LUT_SIZE × RGB table by linear interpolation. */
export function buildLut(p: Palette): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 3);
  const stops = p.stops;
  let k = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / LUT_SIZE;
    while (k < stops.length - 2 && t >= stops[k + 1][0]) k++;
    const [t0, r0, g0, b0] = stops[k];
    const [t1, r1, g1, b1] = stops[k + 1];
    const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    lut[3 * i] = r0 + (r1 - r0) * u;
    lut[3 * i + 1] = g0 + (g1 - g0) * u;
    lut[3 * i + 2] = b0 + (b1 - b0) * u;
  }
  return lut;
}

const lutCache = new Map<string, Uint8ClampedArray>();

function lutFor(p: Palette): Uint8ClampedArray {
  let lut = lutCache.get(p.id);
  if (!lut) {
    lut = buildLut(p);
    lutCache.set(p.id, lut);
  }
  return lut;
}

/** Maps smooth iteration values to RGBA. Interior (v < 0) is opaque black. */
export function colourise(
  values: Float32Array,
  palette: Palette,
  density: number,
  offset: number,
  out: Uint8ClampedArray,
): void {
  const lut = lutFor(palette);
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const o = 4 * i;
    if (v < 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 255;
      continue;
    }
    let t = density * Math.log2(1 + v) + offset;
    t -= Math.floor(t);
    let idx = (t * LUT_SIZE) | 0;
    if (idx >= LUT_SIZE) idx = LUT_SIZE - 1;
    if (idx < 0) idx = 0;
    out[o] = lut[3 * idx];
    out[o + 1] = lut[3 * idx + 1];
    out[o + 2] = lut[3 * idx + 2];
    out[o + 3] = 255;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/palette.test.ts
```
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/palette.ts tests/palette.test.ts
git commit -m "feat: palettes, lookup table and smooth colouring" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Scheduler with tile queue and reference reuse (`scheduler.ts`)

**Files:**
- Create: `src/scheduler.ts`
- Test: `tests/scheduler.test.ts`

**Interfaces:**
- Consumes: `viewport.ts` (`effectiveMaxIter`, `halfDiagonal`, `offsetFrom`, `passGeometry`, `precisionBits`, `refLength`, `ViewState`), `perturb.ts` (`TileJob`), `reference.ts` (`SharedRefMeta`), `bigfloat.ts` (`BigComplex`).
- Produces (decisions 6, 8, 9, 10; Task 15 adds BLA fields to the protocol):
  ```ts
  interface WorkerLike { postMessage(message: unknown, transfer?: Transferable[]): void; onmessage: ((ev: { data: unknown }) => void) | null; terminate(): void }
  type ToReferenceWorker = { type: 'compute'; id: number; centre: BigComplex; length: number; bits: number; delta0Max: number }
  type FromReferenceWorker = { type: 'progress'; id: number; done: number; total: number } | { type: 'done'; id: number; ref: SharedRefMeta }
  type ToRenderWorker = { type: 'setShared'; ref: SharedRefMeta } | { type: 'tile'; job: TileJob }
  type FromRenderWorker = { type: 'tile'; job: TileJob; data: Float32Array }
  interface RenderTarget { widthCss: number; heightCss: number; dpr: number }
  interface PassResult { generation: number; pass: number; stepCss: number; width: number; height: number; values: Float32Array; elapsedMs: number; final: boolean }
  interface SchedulerEvents { onPass(r: PassResult): void; onReferenceStart(): void; onReferenceProgress(done: number, total: number): void; onReferenceDone(): void }
  interface SchedulerOptions { poolSize: number; createRenderWorker(): WorkerLike; createReferenceWorker(): WorkerLike; now?: () => number }
  const TILE = 64, PASS_STRIDES = [8, 4, 2, 1], REUSE_RADIUS = 4, DELTA0_HEADROOM = 2
  class Scheduler { constructor(options, events); render(view: ViewState, target: RenderTarget): void; dispose(): void }
  ```
  Behaviour: `render` bumps the generation and clears the queue. If the held reference is reusable (within `REUSE_RADIUS` half-diagonals, `refLength(ceiling) ≤ capacity`, `bits ≥ precisionBits(scale)`) passes start at once; if a compatible reference is in flight it waits; otherwise it terminates any in-flight reference worker, creates a fresh one and posts `compute` with `delta0Max = DELTA0_HEADROOM × halfDiagonal`. Passes are queued in stride order as 64×64 tiles; each idle render worker holds at most one tile; results from stale generations are dropped.

- [ ] **Step 1: Write the failing tests**

`tests/scheduler.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SharedRefMeta } from '../src/reference';
import {
  DELTA0_HEADROOM, Scheduler, type FromRenderWorker, type PassResult, type ToReferenceWorker,
  type ToRenderWorker, type WorkerLike,
} from '../src/scheduler';
import { defaultView, halfDiagonal, pan, zoomAbout } from '../src/viewport';

class FakeWorker implements WorkerLike {
  posted: unknown[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  terminated = false;
  answered = 0;
  postMessage(message: unknown): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }
  receive(data: unknown): void { this.onmessage?.({ data }); }
  tiles(): ToRenderWorker[] {
    return (this.posted as ToRenderWorker[]).filter((m) => m.type === 'tile');
  }
  computes(): ToReferenceWorker[] {
    return (this.posted as ToReferenceWorker[]).filter((m) => m.type === 'compute');
  }
  outstanding(): number { return this.tiles().length - this.answered; }
  /** Answers the oldest unanswered tile with a buffer filled with `value`. */
  answerOne(value = 1): void {
    const msg = this.tiles()[this.answered];
    if (!msg || msg.type !== 'tile') throw new Error('no outstanding tile');
    this.answered++;
    const data = new Float32Array(msg.job.w * msg.job.h).fill(value);
    const reply: FromRenderWorker = { type: 'tile', job: msg.job, data };
    this.receive(reply);
  }
}

function fakeRef(msg: ToReferenceWorker): SharedRefMeta {
  return {
    buffer: new SharedArrayBuffer(16 * msg.length), length: msg.length, capacity: msg.length,
    escaped: false, centre: msg.centre, bits: msg.bits,
  };
}

const W = 128;
const H = 64;
const target = { widthCss: W, heightCss: H, dpr: 1 };

function setup(poolSize = 2) {
  const renders: FakeWorker[] = [];
  const refs: FakeWorker[] = [];
  const passes: PassResult[] = [];
  const progress: [number, number][] = [];
  const counts = { starts: 0, dones: 0 };
  const scheduler = new Scheduler(
    {
      poolSize,
      createRenderWorker: () => { const w = new FakeWorker(); renders.push(w); return w; },
      createReferenceWorker: () => { const w = new FakeWorker(); refs.push(w); return w; },
      now: () => 0,
    },
    {
      onPass: (r) => passes.push(r),
      onReferenceStart: () => { counts.starts++; },
      onReferenceProgress: (d, t) => progress.push([d, t]),
      onReferenceDone: () => { counts.dones++; },
    },
  );
  const completeReference = () => {
    const w = refs[refs.length - 1];
    const msg = w.computes()[w.computes().length - 1];
    w.receive({ type: 'done', id: msg.id, ref: fakeRef(msg) });
  };
  const drain = () => {
    for (let guard = 0; guard < 1000; guard++) {
      const w = renders.find((r) => r.outstanding() > 0);
      if (!w) return;
      w.answerOne();
    }
    throw new Error('drain did not settle');
  };
  return { scheduler, renders, refs, passes, progress, counts, completeReference, drain };
}

describe('Scheduler', () => {
  it('requests a reference before posting any tile', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    expect(s.refs).toHaveLength(1);
    const msg = s.refs[0].computes()[0];
    expect(msg.length).toBe(1024);
    expect(msg.bits).toBe(128);
    expect(msg.delta0Max).toBeCloseTo(DELTA0_HEADROOM * halfDiagonal(defaultView(W), W, H), 15);
    expect(s.renders.every((r) => r.posted.length === 0)).toBe(true);
    expect(s.counts.starts).toBe(1);
  });

  it('shares the reference and posts exactly one tile per worker', () => {
    const s = setup(3);
    s.scheduler.render(defaultView(W), target);
    s.completeReference();
    expect(s.counts.dones).toBe(1);
    for (const r of s.renders) {
      expect((r.posted[0] as ToRenderWorker).type).toBe('setShared');
      expect(r.tiles()).toHaveLength(1);
    }
  });

  it('assembles passes in stride order and flags the last as final', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    s.completeReference();
    s.drain();
    expect(s.passes.map((p) => [p.pass, p.stepCss, p.width, p.height, p.final])).toEqual([
      [0, 8, 16, 8, false], [1, 4, 32, 16, false], [2, 2, 64, 32, false], [3, 1, 128, 64, true],
    ]);
    expect(s.passes[3].values.every((v) => v === 1)).toBe(true);
    expect(s.passes[3].values.length).toBe(128 * 64);
  });

  it('adds a device-pixel-ratio pass when dpr > 1', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), { ...target, dpr: 2 });
    s.completeReference();
    s.drain();
    expect(s.passes).toHaveLength(5);
    expect(s.passes[4]).toMatchObject({ stepCss: 0.5, width: 256, height: 128, final: true });
  });

  it('drops stale tiles and clears the queue on a view change', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 1, 0), target);
    for (const r of s.renders) r.answerOne(7);
    expect(s.passes).toHaveLength(0);
    for (const r of s.renders) {
      const latest = r.tiles()[r.tiles().length - 1];
      expect(latest.type === 'tile' && latest.job.generation).toBe(2);
    }
    s.drain();
    expect(s.passes.every((p) => p.generation === 2)).toBe(true);
    expect(s.passes).toHaveLength(4);
    expect(s.passes[3].values.every((v) => v === 1)).toBe(true);
  });

  it('reuses a nearby reference without a new request', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 10, 5), target);
    expect(s.refs[0].computes()).toHaveLength(1);
    expect(s.counts.starts).toBe(1);
  });

  it('requests a new reference when the needed length exceeds the capacity', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(zoomAbout(view, 64, 32, 1e12, W, H), target);
    expect(s.refs[0].computes()).toHaveLength(2);
    expect(s.refs[0].computes()[1].length).toBe(8192);
    expect(s.counts.starts).toBe(2);
  });

  it('requests a new reference when the centre moves far away', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 10000, 0), target);
    expect(s.refs[0].computes()).toHaveLength(2);
  });

  it('terminates an in-flight reference worker when superseded', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    const first = s.refs[0].computes()[0];
    s.scheduler.render(zoomAbout(view, 64, 32, 1e12, W, H), target);
    expect(s.refs[0].terminated).toBe(true);
    expect(s.refs).toHaveLength(2);
    s.refs[0].receive({ type: 'done', id: first.id, ref: fakeRef(first) });
    expect(s.counts.dones).toBe(0);
    s.completeReference();
    expect(s.counts.dones).toBe(1);
    expect(s.renders.every((r) => r.tiles().length === 1)).toBe(true);
  });

  it('waits for a compatible in-flight reference', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.scheduler.render(pan(view, 3, 3), target);
    expect(s.refs).toHaveLength(1);
    expect(s.refs[0].computes()).toHaveLength(1);
    s.completeReference();
    for (const r of s.renders) {
      const t = r.tiles()[0];
      expect(t.type === 'tile' && t.job.generation).toBe(2);
    }
  });

  it('forwards progress for the current id and ignores stale ids', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    const id = s.refs[0].computes()[0].id;
    s.refs[0].receive({ type: 'progress', id, done: 4096, total: 8192 });
    s.refs[0].receive({ type: 'progress', id: 999, done: 1, total: 2 });
    expect(s.progress).toEqual([[4096, 8192]]);
  });

  it('dispose terminates every worker', () => {
    const s = setup(2);
    s.scheduler.dispose();
    expect(s.renders.every((r) => r.terminated)).toBe(true);
    expect(s.refs[0].terminated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/scheduler.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/scheduler"`.

- [ ] **Step 3: Write `src/scheduler.ts`**

```ts
import type { BigComplex } from './bigfloat';
import type { TileJob } from './perturb';
import type { SharedRefMeta } from './reference';
import {
  effectiveMaxIter, halfDiagonal, offsetFrom, passGeometry, precisionBits, refLength, type ViewState,
} from './viewport';

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  terminate(): void;
}

export type ToReferenceWorker = {
  type: 'compute'; id: number; centre: BigComplex; length: number; bits: number; delta0Max: number;
};
export type FromReferenceWorker =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'done'; id: number; ref: SharedRefMeta };
export type ToRenderWorker =
  | { type: 'setShared'; ref: SharedRefMeta }
  | { type: 'tile'; job: TileJob };
export type FromRenderWorker = { type: 'tile'; job: TileJob; data: Float32Array };

export interface RenderTarget {
  widthCss: number;
  heightCss: number;
  dpr: number;
}

export interface PassResult {
  generation: number;
  pass: number;
  stepCss: number;
  width: number;
  height: number;
  values: Float32Array;
  elapsedMs: number;
  final: boolean;
}

export interface SchedulerEvents {
  onPass(result: PassResult): void;
  onReferenceStart(): void;
  onReferenceProgress(done: number, total: number): void;
  onReferenceDone(): void;
}

export interface SchedulerOptions {
  poolSize: number;
  createRenderWorker(): WorkerLike;
  createReferenceWorker(): WorkerLike;
  now?: () => number;
}

export const TILE = 64;
export const PASS_STRIDES: readonly number[] = [8, 4, 2, 1];
export const REUSE_RADIUS = 4;
export const DELTA0_HEADROOM = 2;

interface PendingReference {
  id: number;
  centre: BigComplex;
  length: number;
  bits: number;
}

interface PassState {
  pass: number;
  stepCss: number;
  width: number;
  height: number;
  values: Float32Array;
  remaining: number;
}

interface Slot {
  worker: WorkerLike;
  busy: boolean;
}

export class Scheduler {
  private generation = 0;
  private queue: TileJob[] = [];
  private readonly passes = new Map<number, PassState>();
  private readonly slots: Slot[] = [];
  private refWorker: WorkerLike;
  private ref: SharedRefMeta | null = null;
  private pending: PendingReference | null = null;
  private nextId = 1;
  private view: ViewState | null = null;
  private target: RenderTarget | null = null;
  private startedAt = 0;
  private readonly now: () => number;

  constructor(
    private readonly options: SchedulerOptions,
    private readonly events: SchedulerEvents,
  ) {
    this.now = options.now ?? (() => performance.now());
    for (let i = 0; i < Math.max(1, options.poolSize); i++) this.slots.push(this.createSlot());
    this.refWorker = this.createReferenceWorker();
  }

  /** Renders `view`. Outstanding work for the previous view is abandoned. */
  render(view: ViewState, target: RenderTarget): void {
    this.generation++;
    this.queue = [];
    this.passes.clear();
    this.view = view;
    this.target = target;
    this.startedAt = this.now();
    const need = refLength(effectiveMaxIter(view, target.widthCss));
    const bits = precisionBits(view.scale);
    const half = halfDiagonal(view, target.widthCss, target.heightCss);
    if (this.ref && this.reusable(this.ref.centre, this.ref.capacity, this.ref.bits, view, need, bits, half)) {
      this.startPasses();
      return;
    }
    if (this.pending && this.reusable(this.pending.centre, this.pending.length, this.pending.bits, view, need, bits, half)) {
      return;
    }
    this.requestReference(view.centre, need, bits, DELTA0_HEADROOM * half);
  }

  dispose(): void {
    for (const s of this.slots) s.worker.terminate();
    this.refWorker.terminate();
  }

  private createSlot(): Slot {
    const worker = this.options.createRenderWorker();
    const slot: Slot = { worker, busy: false };
    worker.onmessage = (ev) => this.onRenderMessage(slot, ev.data as FromRenderWorker);
    return slot;
  }

  private createReferenceWorker(): WorkerLike {
    const worker = this.options.createReferenceWorker();
    worker.onmessage = (ev) => this.onReferenceMessage(ev.data as FromReferenceWorker);
    return worker;
  }

  private reusable(
    centre: BigComplex, capacity: number, bits: number,
    view: ViewState, need: number, needBits: number, half: number,
  ): boolean {
    const d = offsetFrom(centre, view);
    return Math.hypot(d.re, d.im) <= REUSE_RADIUS * half && need <= capacity && bits >= needBits;
  }

  private requestReference(centre: BigComplex, length: number, bits: number, delta0Max: number): void {
    if (this.pending) {
      this.refWorker.terminate();
      this.refWorker = this.createReferenceWorker();
    }
    const id = this.nextId++;
    this.pending = { id, centre, length, bits };
    this.events.onReferenceStart();
    const msg: ToReferenceWorker = { type: 'compute', id, centre, length, bits, delta0Max };
    this.refWorker.postMessage(msg);
  }

  private onReferenceMessage(msg: FromReferenceWorker): void {
    if (!this.pending || msg.id !== this.pending.id) return;
    if (msg.type === 'progress') {
      this.events.onReferenceProgress(msg.done, msg.total);
      return;
    }
    this.pending = null;
    this.ref = msg.ref;
    this.events.onReferenceDone();
    const shared: ToRenderWorker = { type: 'setShared', ref: msg.ref };
    for (const s of this.slots) s.worker.postMessage(shared);
    if (this.view && this.target) this.startPasses();
  }

  private startPasses(): void {
    const view = this.view;
    const target = this.target;
    const ref = this.ref;
    if (!view || !target || !ref) return;
    const maxIter = effectiveMaxIter(view, target.widthCss);
    const strides = [...PASS_STRIDES];
    if (target.dpr > 1) strides.push(1 / target.dpr);
    this.queue = [];
    this.passes.clear();
    strides.forEach((stepCss, pass) => {
      const width = Math.ceil(target.widthCss / stepCss);
      const height = Math.ceil(target.heightCss / stepCss);
      const geo = passGeometry(view, ref.centre, stepCss, target.widthCss, target.heightCss);
      const state: PassState = { pass, stepCss, width, height, values: new Float32Array(width * height), remaining: 0 };
      for (let y = 0; y < height; y += TILE) {
        for (let x = 0; x < width; x += TILE) {
          this.queue.push({
            generation: this.generation, pass, x, y,
            w: Math.min(TILE, width - x), h: Math.min(TILE, height - y),
            originRe: geo.originRe, originIm: geo.originIm, step: geo.step, maxIter,
          });
          state.remaining++;
        }
      }
      this.passes.set(pass, state);
    });
    this.dispatch();
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.busy = true;
      const msg: ToRenderWorker = { type: 'tile', job };
      slot.worker.postMessage(msg);
    }
  }

  private onRenderMessage(slot: Slot, msg: FromRenderWorker): void {
    slot.busy = false;
    if (msg.type === 'tile' && msg.job.generation === this.generation) {
      const state = this.passes.get(msg.job.pass);
      if (state) {
        const { x, y, w, h } = msg.job;
        for (let row = 0; row < h; row++) {
          state.values.set(msg.data.subarray(row * w, row * w + w), (y + row) * state.width + x);
        }
        if (--state.remaining === 0) {
          this.passes.delete(msg.job.pass);
          this.events.onPass({
            generation: this.generation, pass: state.pass, stepCss: state.stepCss,
            width: state.width, height: state.height, values: state.values,
            elapsedMs: this.now() - this.startedAt, final: this.passes.size === 0,
          });
        }
      }
    }
    this.dispatch();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/scheduler.test.ts
```
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/scheduler.ts tests/scheduler.test.ts
git commit -m "feat: scheduler with tile queue, progressive passes and reference reuse" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Hash history and download filename (`history.ts`, `filename.ts`)

**Files:**
- Create: `src/history.ts`, `src/filename.ts`
- Test: `tests/history.test.ts`, `tests/filename.test.ts`

**Interfaces:**
- Produces (decisions 14, 17):
  ```ts
  // history.ts
  interface HistoryLike {
    location: { hash: string };
    history: { pushState(data: unknown, unused: string, url?: string | URL | null): void;
               replaceState(data: unknown, unused: string, url?: string | URL | null): void };
    addEventListener(type: 'hashchange', listener: () => void): void;
    removeEventListener(type: 'hashchange', listener: () => void): void;
  }
  interface HashHistory { write(hash: string, mode: 'replace' | 'push'): void; current(): string; dispose(): void }
  createHistory(onExternalChange: (hash: string) => void, win?: HistoryLike): HashHistory
     // write is a no-op when hash equals the current one; hashchange events matching the last own write are ignored
  // filename.ts
  hash8(s: string): string                                     // 8 lowercase hex digits, FNV-1a 32-bit
  downloadName(exponent: number, centreRe: string, centreIm: string): string   // mandelbrot-e<exp 1dp>-<hash8>.png
  ```

- [ ] **Step 1: Write the failing tests**

`tests/history.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createHistory, type HistoryLike } from '../src/history';

function fakeWindow(initial = '') {
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const win: HistoryLike = {
    location: { hash: initial },
    history: {
      pushState: (_d, _t, url) => { calls.push(`push:${url}`); win.location.hash = String(url ?? ''); },
      replaceState: (_d, _t, url) => { calls.push(`replace:${url}`); win.location.hash = String(url ?? ''); },
    },
    addEventListener: (_type, fn) => { listeners.add(fn); },
    removeEventListener: (_type, fn) => { listeners.delete(fn); },
  };
  const fire = () => { for (const fn of listeners) fn(); };
  return { win, calls, listeners, fire, external: (hash: string) => { win.location.hash = hash; fire(); } };
}

describe('createHistory', () => {
  it('writes with replace or push and updates the current hash', () => {
    const f = fakeWindow('#start');
    const seen: string[] = [];
    const h = createHistory((hash) => seen.push(hash), f.win);
    h.write('#a', 'replace');
    h.write('#b', 'push');
    expect(f.calls).toEqual(['replace:#a', 'push:#b']);
    expect(h.current()).toBe('#b');
    expect(seen).toEqual([]);
  });

  it('does not rewrite the current hash', () => {
    const f = fakeWindow('#same');
    const h = createHistory(() => {}, f.win);
    h.write('#same', 'push');
    expect(f.calls).toEqual([]);
  });

  it('ignores hashchange events caused by its own writes', () => {
    const f = fakeWindow('');
    const seen: string[] = [];
    const h = createHistory((hash) => seen.push(hash), f.win);
    h.write('#mine', 'replace');
    f.fire();
    expect(seen).toEqual([]);
  });

  it('reports external changes such as the back button', () => {
    const f = fakeWindow('#one');
    const seen: string[] = [];
    createHistory((hash) => seen.push(hash), f.win);
    f.external('#two');
    f.external('#two');
    f.external('#three');
    expect(seen).toEqual(['#two', '#three']);
  });

  it('dispose removes the listener', () => {
    const f = fakeWindow('');
    const seen: string[] = [];
    const h = createHistory((hash) => seen.push(hash), f.win);
    expect(f.listeners.size).toBe(1);
    h.dispose();
    expect(f.listeners.size).toBe(0);
    f.external('#late');
    expect(seen).toEqual([]);
  });
});
```

`tests/filename.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { downloadName, hash8 } from '../src/filename';

describe('hash8', () => {
  it('is deterministic, 8 lowercase hex digits, and input-sensitive', () => {
    expect(hash8('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash8('abc')).toBe(hash8('abc'));
    expect(hash8('abc')).not.toBe(hash8('abd'));
    expect(hash8('')).toBe('811c9dc5');
  });
});

describe('downloadName', () => {
  it('stays short at any depth and encodes the exponent', () => {
    const re = '-0.' + '7'.repeat(300);
    const im = '0.' + '1'.repeat(300);
    const name = downloadName(123.456, re, im);
    expect(name).toMatch(/^mandelbrot-e123\.5-[0-9a-f]{8}\.png$/);
    expect(name.length).toBeLessThan(40);
    expect(downloadName(-0.4, '-0.5', '0')).toMatch(/^mandelbrot-e-0\.4-[0-9a-f]{8}\.png$/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/history.test.ts tests/filename.test.ts
```
Expected: FAIL with unresolved imports for both modules.

- [ ] **Step 3: Write `src/history.ts`**

```ts
export interface HistoryLike {
  location: { hash: string };
  history: {
    pushState(data: unknown, unused: string, url?: string | URL | null): void;
    replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  };
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

export interface HashHistory {
  write(hash: string, mode: 'replace' | 'push'): void;
  current(): string;
  dispose(): void;
}

/**
 * Writes the view hash via the History API and reports changes that did not come from
 * this module (back button, manual edits). Own writes never trigger `onExternalChange`.
 */
export function createHistory(
  onExternalChange: (hash: string) => void,
  win: HistoryLike = window as HistoryLike,
): HashHistory {
  let lastWritten = win.location.hash;
  const handler = () => {
    const hash = win.location.hash;
    if (hash === lastWritten) return;
    lastWritten = hash;
    onExternalChange(hash);
  };
  win.addEventListener('hashchange', handler);
  return {
    write(hash, mode) {
      if (hash === win.location.hash) return;
      lastWritten = hash;
      if (mode === 'replace') win.history.replaceState(null, '', hash);
      else win.history.pushState(null, '', hash);
    },
    current: () => win.location.hash,
    dispose() {
      win.removeEventListener('hashchange', handler);
    },
  };
}
```

- [ ] **Step 4: Write `src/filename.ts`**

```ts
/** FNV-1a 32-bit hash as 8 lowercase hex digits. */
export function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Short, filesystem-safe PNG name: the zoom exponent plus a hash of the centre. */
export function downloadName(exponent: number, centreRe: string, centreIm: string): string {
  return `mandelbrot-e${exponent.toFixed(1)}-${hash8(`${centreRe},${centreIm}`)}.png`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/history.test.ts tests/filename.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/history.ts src/filename.ts tests/history.test.ts tests/filename.test.ts
git commit -m "feat: hash history with own-write suppression and PNG filename" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Workers, canvas and the first visible render

**Files:**
- Create: `src/worker-scope.ts`, `src/render-worker.ts`, `src/reference-worker.ts`, `src/canvas.ts`, `e2e/helpers.ts`, `e2e/viewer.spec.ts`
- Modify: `src/main.ts` (replace the placeholder)

**Interfaces:**
- Consumes: `scheduler.ts` (protocol types, `Scheduler`, `PassResult`), `perturb.ts` (`renderTile`), `reference.ts` (`computeReference`, `toRefMeta`, `fromRefMeta`), `palette.ts` (`colourise`, `paletteById`), `viewport.ts` (`defaultView`, `fromHash`, `offsetFrom`).
- Produces:
  ```ts
  // canvas.ts
  class CanvasView {
    constructor(canvas: HTMLCanvasElement)
    resize(widthCss: number, heightCss: number, dpr: number): void      // sets backing size only; does not redraw
    paint(rgba: Uint8ClampedArray, width: number, height: number, stepCss: number, view: ViewState, smooth: boolean): void
    transformTo(view: ViewState): void                                  // redraws the last bitmap as seen from `view`
    toBlob(): Promise<Blob>
  }
  // worker-scope.ts
  interface WorkerScope { onmessage: ((ev: MessageEvent) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void }
  const scope: WorkerScope
  ```
  Render workers hold the shared reference from `setShared` and answer every `tile` with a transferred `Float32Array`. The reference worker answers `compute` with `progress` messages and a `done` carrying `SharedRefMeta`. Task 15 extends both with BLA.

- [ ] **Step 1: Write the failing Playwright test**

`e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test';

/** Number of distinct colours among sampled canvas pixels. A blank canvas gives 1. */
export async function distinctColours(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('view') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
}

export async function currentHash(page: Page): Promise<string> {
  return page.evaluate(() => location.hash);
}

export function hashParam(hash: string, key: string): string | null {
  return new URLSearchParams(hash.slice(1)).get(key);
}

/** Loads the page and waits until the first pass has painted. */
export async function openViewer(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('view') !== null);
}

export async function waitForImage(page: Page): Promise<void> {
  await expect.poll(() => distinctColours(page), { timeout: 20_000 }).toBeGreaterThan(8);
}
```

`e2e/viewer.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { openViewer, waitForImage } from './helpers';

test('is cross-origin isolated so SharedArrayBuffer is available', async ({ page }) => {
  await openViewer(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
});

test('renders the default view progressively', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
});
```

- [ ] **Step 2: Run the Playwright test to verify it fails**

```bash
npm run test:e2e
```
Expected: FAIL. The first test passes already (headers come from `vite.config.ts`); the second fails because the canvas is blank.

- [ ] **Step 3: Write `src/worker-scope.ts`**

```ts
/** Minimal typing for a dedicated worker's global scope without pulling in the WebWorker lib. */
export interface WorkerScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export const scope = self as unknown as WorkerScope;
```

- [ ] **Step 4: Write `src/render-worker.ts`**

```ts
import { renderTile } from './perturb';
import { fromRefMeta, type ReferenceOrbit } from './reference';
import type { FromRenderWorker, ToRenderWorker } from './scheduler';
import { scope } from './worker-scope';

let ref: ReferenceOrbit | null = null;

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToRenderWorker;
  if (msg.type === 'setShared') {
    ref = fromRefMeta(msg.ref);
    return;
  }
  const { job } = msg;
  const out = new Float32Array(job.w * job.h);
  // The scheduler always shares a reference before posting tiles; the fill is a defensive fallback.
  if (ref) renderTile(ref, job, out);
  else out.fill(-1);
  const reply: FromRenderWorker = { type: 'tile', job, data: out };
  scope.postMessage(reply, [out.buffer]);
};
```

- [ ] **Step 5: Write `src/reference-worker.ts`**

```ts
import { computeReference, toRefMeta, type ReferenceOrbit } from './reference';
import type { FromReferenceWorker, ToReferenceWorker } from './scheduler';
import { scope } from './worker-scope';

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToReferenceWorker;
  if (msg.type !== 'compute') return;
  const buffer = new SharedArrayBuffer(msg.length * 16);
  const z = new Float64Array(buffer);
  const result = computeReference(msg.centre, msg.length, msg.bits, z, (done) => {
    const progress: FromReferenceWorker = { type: 'progress', id: msg.id, done, total: msg.length };
    scope.postMessage(progress);
    return true;
  });
  const ref: ReferenceOrbit = {
    z, length: result.length, capacity: msg.length, escaped: result.escaped, centre: msg.centre, bits: msg.bits,
  };
  const reply: FromReferenceWorker = { type: 'done', id: msg.id, ref: toRefMeta(ref, buffer) };
  scope.postMessage(reply);
};
```

- [ ] **Step 6: Write `src/canvas.ts`**

```ts
import { offsetFrom, type ViewState } from './viewport';

/** Owns the visible canvas: paints completed passes and transforms the last bitmap during gestures. */
export class CanvasView {
  private readonly ctx: CanvasRenderingContext2D;
  private last: HTMLCanvasElement | null = null;
  private lastStepCss = 1;
  private lastView: ViewState | null = null;
  private widthCss = 0;
  private heightCss = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas context unavailable');
    this.ctx = ctx;
  }

  resize(widthCss: number, heightCss: number, dpr: number): void {
    const w = Math.round(widthCss * dpr);
    const h = Math.round(heightCss * dpr);
    this.widthCss = widthCss;
    this.heightCss = heightCss;
    this.dpr = dpr;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.width = `${widthCss}px`;
    this.canvas.style.height = `${heightCss}px`;
  }

  /** Paints a completed pass (`rgba` is width × height × 4) covering the viewport at `stepCss` CSS px per pass px. */
  paint(rgba: Uint8ClampedArray, width: number, height: number, stepCss: number, view: ViewState, smooth: boolean): void {
    if (!this.last || this.last.width !== width || this.last.height !== height) {
      this.last = document.createElement('canvas');
      this.last.width = width;
      this.last.height = height;
    }
    const lctx = this.last.getContext('2d');
    if (!lctx) throw new Error('2d canvas context unavailable');
    lctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    this.lastStepCss = stepCss;
    this.lastView = view;
    this.clear();
    this.ctx.imageSmoothingEnabled = smooth;
    this.ctx.drawImage(this.last, 0, 0, width * stepCss, height * stepCss);
  }

  /** Redraws the last painted bitmap translated and scaled to where it belongs in `view`. */
  transformTo(view: ViewState): void {
    if (!this.last || !this.lastView) return;
    this.clear();
    const ratio = this.lastView.scale / view.scale;
    const d = offsetFrom(view.centre, this.lastView); // last centre − new centre
    const cx = this.widthCss / 2 + d.re / view.scale;
    const cy = this.heightCss / 2 - d.im / view.scale;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(
      this.last,
      cx - (this.widthCss / 2) * ratio,
      cy - (this.heightCss / 2) * ratio,
      this.last.width * this.lastStepCss * ratio,
      this.last.height * this.lastStepCss * ratio,
    );
  }

  toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
    });
  }

  private clear(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.widthCss, this.heightCss);
  }
}
```

- [ ] **Step 7: Replace `src/main.ts`**

```ts
import './styles.css';
import { CanvasView } from './canvas';
import { colourise, paletteById } from './palette';
import { Scheduler, type PassResult, type RenderTarget } from './scheduler';
import { defaultView, fromHash, type ViewState } from './viewport';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const canvasView = new CanvasView(canvas);

function target(): RenderTarget {
  return { widthCss: window.innerWidth, heightCss: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}

let view: ViewState = fromHash(location.hash) ?? defaultView(target().widthCss);
let renderedView: ViewState = view;
let latest: PassResult | null = null;

const scheduler = new Scheduler(
  {
    poolSize: Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
    createRenderWorker: () => new Worker(new URL('./render-worker.ts', import.meta.url), { type: 'module' }),
    createReferenceWorker: () => new Worker(new URL('./reference-worker.ts', import.meta.url), { type: 'module' }),
  },
  {
    onPass(result) {
      latest = result;
      repaint();
    },
    onReferenceStart() {},
    onReferenceProgress() {},
    onReferenceDone() {},
  },
);

function repaint(): void {
  if (!latest) return;
  const rgba = new Uint8ClampedArray(latest.width * latest.height * 4);
  colourise(latest.values, paletteById(renderedView.palette), renderedView.density, renderedView.offset, rgba);
  canvasView.paint(rgba, latest.width, latest.height, latest.stepCss, renderedView, !latest.final);
}

function render(): void {
  const t = target();
  canvasView.resize(t.widthCss, t.heightCss, t.dpr);
  canvasView.transformTo(view);
  renderedView = view;
  scheduler.render(view, t);
}

window.addEventListener('resize', render);
render();
```

- [ ] **Step 8: Run lint, unit tests, build and the Playwright test**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
```
Expected: lint clean; unit tests all pass; build lists `dist/assets/render-worker-*.js` and `dist/assets/reference-worker-*.js`; Playwright prints `2 passed`.

- [ ] **Step 9: Look at it**

```bash
npm run dev
```
Open `http://localhost:5173/` in Chrome. The Mandelbrot set appears within a second, blocky at first, then sharp. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add src/worker-scope.ts src/render-worker.ts src/reference-worker.ts src/canvas.ts src/main.ts e2e/helpers.ts e2e/viewer.spec.ts
git commit -m "feat: workers, canvas and first progressive render" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Input, gestures and URL history

**Files:**
- Create: `src/input.ts`
- Test: `tests/input.test.ts` (pure `wheelFactor` only), `e2e/viewer.spec.ts` (append)
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `history.ts` (`createHistory`), `viewport.ts` (`zoomAbout`, `pan`, `defaultView`, `toHash`, `fromHash`, `sameGeometry`), `canvas.ts` (`transformTo`).
- Produces (decisions 13, 14, 16):
  ```ts
  const WHEEL_BASE = 1.1, WHEEL_MIN = 0.25, WHEEL_MAX = 4, GESTURE_END_MS = 150
  wheelFactor(deltaY: number, deltaMode: number, viewportHeight: number): number
     // 1.1 ** (−deltaPx / 100) clamped; deltaMode 1 (lines) → ×16 px, 2 (pages) → ×viewportHeight
  interface InputActions { zoomAt(px, py, factor): void; panBy(dx, dy): void; reset(): void; save(): void; toggleHelp(): void; closeHelp(): void; gestureEnd(): void }
  attachInput(el: HTMLElement, actions: InputActions): () => void    // returns a detach function
  ```
  History semantics: the first view change of a gesture is a `push`, later changes within 150 ms are `replace`, so one gesture is one back-button step. Colour-only changes repaint from the cached values; geometry changes re-render. An external hash change (back button) re-parses; an empty or invalid hash means the default view.

- [ ] **Step 1: Write the failing unit test**

`tests/input.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { WHEEL_MAX, WHEEL_MIN, wheelFactor } from '../src/input';

describe('wheelFactor', () => {
  it('zooms in on scroll up and out on scroll down by 1.1 per 100 px', () => {
    expect(wheelFactor(-100, 0, 600)).toBeCloseTo(1.1, 12);
    expect(wheelFactor(100, 0, 600)).toBeCloseTo(1 / 1.1, 12);
    expect(wheelFactor(-300, 0, 600)).toBeCloseTo(1.1 ** 3, 12);
  });

  it('normalises line and page delta modes', () => {
    expect(wheelFactor(-3, 1, 600)).toBeCloseTo(1.1 ** 0.48, 12);
    expect(wheelFactor(-1, 2, 600)).toBeCloseTo(1.1 ** 6, 12);
  });

  it('clamps extreme deltas', () => {
    expect(wheelFactor(-100000, 0, 600)).toBe(WHEEL_MAX);
    expect(wheelFactor(100000, 0, 600)).toBe(WHEEL_MIN);
  });
});
```

- [ ] **Step 2: Write the failing Playwright tests (append to `e2e/viewer.spec.ts`)**

```ts
import { currentHash, hashParam } from './helpers';

test('wheel zooms in and records the view in the hash', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const before = await currentHash(page);
  expect(hashParam(before, 're')).toBe('-0.5');
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => currentHash(page)).not.toBe(before);
  const after = await currentHash(page);
  expect(Number(hashParam(after, 's'))).toBeLessThan(Number(hashParam(before, 's')));
});

test('drag pans and R resets to the default view', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const before = await currentHash(page);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(500, 340, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => currentHash(page)).not.toBe(before);
  const dragged = await currentHash(page);
  expect(Number(hashParam(dragged, 're'))).toBeLessThan(-0.5);
  expect(Number(hashParam(dragged, 'im'))).toBeGreaterThan(0);
  await page.keyboard.press('r');
  await expect.poll(async () => hashParam(await currentHash(page), 're')).toBe('-0.5');
});

test('the back button returns to the view before the last gesture', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const start = await currentHash(page);
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => currentHash(page)).not.toBe(start);
  await page.waitForTimeout(300);
  await page.goBack();
  await expect.poll(() => currentHash(page)).toBe(start);
  await waitForImage(page);
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
npx vitest run tests/input.test.ts
npm run test:e2e
```
Expected: unit test fails with an unresolved import; the three new Playwright tests fail because nothing handles input or writes the hash.

- [ ] **Step 4: Write `src/input.ts`**

```ts
export const WHEEL_BASE = 1.1;
export const WHEEL_MIN = 0.25;
export const WHEEL_MAX = 4;
export const GESTURE_END_MS = 150;

export interface InputActions {
  zoomAt(px: number, py: number, factor: number): void;
  panBy(dx: number, dy: number): void;
  reset(): void;
  save(): void;
  toggleHelp(): void;
  closeHelp(): void;
  gestureEnd(): void;
}

/** Zoom factor for one wheel event. Negative deltaY (scroll up) zooms in. */
export function wheelFactor(deltaY: number, deltaMode: number, viewportHeight: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * viewportHeight : deltaY;
  return Math.min(WHEEL_MAX, Math.max(WHEEL_MIN, WHEEL_BASE ** (-px / 100)));
}

function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON';
}

/** Wires wheel, pointer, double-click and keyboard input on `el` to `actions`. Returns a detach function. */
export function attachInput(el: HTMLElement, actions: InputActions): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const local = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    actions.zoomAt(p.x, p.y, wheelFactor(e.deltaY, e.deltaMode, p.h));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    actions.panBy(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    actions.gestureEnd();
  };
  const onDoubleClick = (e: MouseEvent) => {
    const p = local(e);
    actions.zoomAt(p.x, p.y, 2);
    actions.gestureEnd();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isFormField(e.target)) return;
    const r = el.getBoundingClientRect();
    const stepX = r.width / 10;
    const stepY = r.height / 10;
    switch (e.key) {
      case 'ArrowLeft': actions.panBy(stepX, 0); break;
      case 'ArrowRight': actions.panBy(-stepX, 0); break;
      case 'ArrowUp': actions.panBy(0, stepY); break;
      case 'ArrowDown': actions.panBy(0, -stepY); break;
      case '+': case '=': actions.zoomAt(r.width / 2, r.height / 2, 2); break;
      case '-': case '_': actions.zoomAt(r.width / 2, r.height / 2, 0.5); break;
      case 'r': case 'R': actions.reset(); break;
      case 's': case 'S': actions.save(); return;
      case '?': actions.toggleHelp(); return;
      case 'Escape': actions.closeHelp(); return;
      default: return;
    }
    e.preventDefault();
    actions.gestureEnd();
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('keydown', onKeyDown);
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.removeEventListener('dblclick', onDoubleClick);
    window.removeEventListener('keydown', onKeyDown);
  };
}
```

- [ ] **Step 5: Replace `src/main.ts`**

```ts
import './styles.css';
import { CanvasView } from './canvas';
import { createHistory } from './history';
import { attachInput, GESTURE_END_MS } from './input';
import { colourise, paletteById } from './palette';
import { Scheduler, type PassResult, type RenderTarget } from './scheduler';
import {
  defaultView, fromHash, pan, sameGeometry, toHash, zoomAbout, type ViewState,
} from './viewport';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const canvasView = new CanvasView(canvas);

function target(): RenderTarget {
  return { widthCss: window.innerWidth, heightCss: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}

function viewFromHash(hash: string): ViewState {
  return fromHash(hash) ?? defaultView(target().widthCss);
}

let view: ViewState = viewFromHash(location.hash);
let renderedView: ViewState = view;
let latest: PassResult | null = null;
let inGesture = false;
let gestureTimer: number | undefined;

const history = createHistory((hash) => {
  view = viewFromHash(hash);
  render();
});

const scheduler = new Scheduler(
  {
    poolSize: Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
    createRenderWorker: () => new Worker(new URL('./render-worker.ts', import.meta.url), { type: 'module' }),
    createReferenceWorker: () => new Worker(new URL('./reference-worker.ts', import.meta.url), { type: 'module' }),
  },
  {
    onPass(result) {
      latest = result;
      repaint();
    },
    onReferenceStart() {},
    onReferenceProgress() {},
    onReferenceDone() {},
  },
);

function repaint(): void {
  if (!latest) return;
  const rgba = new Uint8ClampedArray(latest.width * latest.height * 4);
  colourise(latest.values, paletteById(renderedView.palette), renderedView.density, renderedView.offset, rgba);
  canvasView.paint(rgba, latest.width, latest.height, latest.stepCss, renderedView, !latest.final);
}

function render(): void {
  const t = target();
  canvasView.resize(t.widthCss, t.heightCss, t.dpr);
  canvasView.transformTo(view);
  renderedView = view;
  scheduler.render(view, t);
}

function endGesture(): void {
  inGesture = false;
  if (gestureTimer !== undefined) {
    window.clearTimeout(gestureTimer);
    gestureTimer = undefined;
  }
}

/** Applies a user-driven view change: history, interim transform, then recompute or recolour. */
function setView(next: ViewState): void {
  if (next === view) return;
  const geometryChanged = !sameGeometry(next, view);
  view = next;
  history.write(toHash(view), inGesture ? 'replace' : 'push');
  inGesture = true;
  if (gestureTimer !== undefined) window.clearTimeout(gestureTimer);
  gestureTimer = window.setTimeout(endGesture, GESTURE_END_MS);
  if (geometryChanged) {
    render();
  } else {
    renderedView = view;
    repaint();
  }
}

attachInput(canvas, {
  zoomAt: (px, py, factor) => setView(zoomAbout(view, px, py, factor, target().widthCss, target().heightCss)),
  panBy: (dx, dy) => setView(pan(view, dx, dy)),
  reset: () => setView(defaultView(target().widthCss)),
  save: () => {},
  toggleHelp: () => {},
  closeHelp: () => {},
  gestureEnd: endGesture,
});

window.addEventListener('resize', render);
history.write(toHash(view), 'replace');
render();
```

- [ ] **Step 6: Run everything**

```bash
npm run lint && npm test && npm run test:e2e
```
Expected: lint clean; unit tests pass including 3 new; Playwright prints `5 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/input.ts src/main.ts tests/input.test.ts e2e/viewer.spec.ts
git commit -m "feat: wheel, drag, keyboard input with gesture-aware URL history" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Toolbar, readout, progress, help and save

**Files:**
- Create: `src/ui.ts`
- Modify: `src/main.ts`, `src/styles.css`, `e2e/viewer.spec.ts` (append)

**Interfaces:**
- Consumes: `palette.ts` (`PALETTES`, `Palette`), `viewport.ts` (`effectiveMaxIter`, `zoomExponent`, constants), `bigfloat.ts` (`toNumber`, `toDecimal`), `filename.ts` (`downloadName`), `canvas.ts` (`toBlob`).
- Produces (decisions 12, 17, 18):
  ```ts
  interface UiCallbacks { onPalette(id: string): void; onDensity(v: number): void; onOffset(v: number): void; onMaxIter(v: number | 'auto'): void; onReset(): void; onSave(): void; onHelp(): void }
  interface Ui { setView(view: ViewState, widthCss: number): void; setProgress(done: number, total: number): void; clearProgress(): void; setRenderTime(ms: number): void; toggleHelp(): void; closeHelp(): void }
  createUi(root: HTMLElement, palettes: readonly Palette[], cb: UiCallbacks): Ui
  ```
  Element ids the tests rely on: `#palette` (select), `#density`, `#offset`, `#iters` (range inputs, log scale), `#auto` (checkbox), `#reset`, `#save`, `#help` (buttons), `#help-overlay`, `#progress`, `#centre`, `#zoom`, `#ceiling`, `#time`.

- [ ] **Step 1: Write the failing Playwright tests (append to `e2e/viewer.spec.ts`)**

```ts
async function samplePixels(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.getElementById('view') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return [];
    const out: number[] = [];
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(((i % 4) + 0.5) * (c.width / 4));
      const y = Math.floor((Math.floor(i / 4) + 0.5) * (c.height / 4));
      const d = ctx.getImageData(x, y, 1, 1).data;
      out.push((d[0] << 16) | (d[1] << 8) | d[2]);
    }
    return out;
  });
}

test('palette change recolours without moving the view', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  await expect.poll(async () => hashParam(await currentHash(page), 'i')).toBe('auto');
  const before = await currentHash(page);
  const pixelsBefore = await samplePixels(page);
  await page.selectOption('#palette', 'fire');
  await expect.poll(async () => hashParam(await currentHash(page), 'p')).toBe('fire');
  const after = await currentHash(page);
  expect(hashParam(after, 're')).toBe(hashParam(before, 're'));
  expect(hashParam(after, 's')).toBe(hashParam(before, 's'));
  await expect.poll(async () => {
    const now = await samplePixels(page);
    return now.filter((v, i) => v !== pixelsBefore[i]).length;
  }).toBeGreaterThan(0);
});

test('the iterations slider overrides the ceiling', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  await page.locator('#iters').fill('12');
  await expect.poll(async () => hashParam(await currentHash(page), 'i')).toBe('4096');
  await expect(page.locator('#auto')).not.toBeChecked();
  await page.locator('#auto').check();
  await expect.poll(async () => hashParam(await currentHash(page), 'i')).toBe('auto');
});

test('help overlay toggles with ? and closes with Escape', async ({ page }) => {
  await openViewer(page);
  await expect(page.locator('#help-overlay')).toBeHidden();
  await page.keyboard.press('?');
  await expect(page.locator('#help-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-overlay')).toBeHidden();
});

test('S downloads a PNG with a short name', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const download = page.waitForEvent('download');
  await page.keyboard.press('s');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^mandelbrot-e-?\d+\.\d-[0-9a-f]{8}\.png$/);
});

test('the readout shows the zoom exponent and iteration ceiling', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  await expect(page.locator('#zoom')).toHaveText(/^-?0\.00$/);
  await expect(page.locator('#ceiling')).toHaveText(/1[,.]?000/);
  await expect(page.locator('#time')).not.toHaveText('', { timeout: 20_000 });
});
```

- [ ] **Step 2: Run Playwright to verify the new tests fail**

```bash
npm run test:e2e
```
Expected: the five new tests fail (no toolbar elements exist yet).

- [ ] **Step 3: Write `src/ui.ts`**

```ts
import { toNumber } from './bigfloat';
import type { Palette } from './palette';
import {
  DENSITY_MAX, DENSITY_MIN, effectiveMaxIter, MAX_ITER, MIN_ITER, zoomExponent, type ViewState,
} from './viewport';

export interface UiCallbacks {
  onPalette(id: string): void;
  onDensity(v: number): void;
  onOffset(v: number): void;
  onMaxIter(v: number | 'auto'): void;
  onReset(): void;
  onSave(): void;
  onHelp(): void;
}

export interface Ui {
  setView(view: ViewState, widthCss: number): void;
  setProgress(done: number, total: number): void;
  clearProgress(): void;
  setRenderTime(ms: number): void;
  toggleHelp(): void;
  closeHelp(): void;
}

const HELP: ReadonlyArray<readonly [string, string]> = [
  ['Scroll or Ctrl+scroll', 'Zoom about the cursor'],
  ['Drag', 'Pan'],
  ['Double-click', 'Zoom in ×2 at the point'],
  ['Arrow keys', 'Pan by a tenth of the view'],
  ['+ / −', 'Zoom in / out ×2'],
  ['R', 'Reset to the default view'],
  ['S', 'Save the current view as PNG'],
  ['?', 'Toggle this help'],
  ['Esc', 'Close this help'],
];

function formatCentre(view: ViewState): string {
  const re = toNumber(view.centre.re);
  const im = toNumber(view.centre.im);
  return `${re.toPrecision(12)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toPrecision(12)}i`;
}

export function createUi(root: HTMLElement, palettes: readonly Palette[], cb: UiCallbacks): Ui {
  root.innerHTML = `
    <div class="toolbar">
      <label>Palette
        <select id="palette">${palettes.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
      </label>
      <label>Density
        <input id="density" type="range" min="${Math.log10(DENSITY_MIN)}" max="${Math.log10(DENSITY_MAX)}" step="0.01">
      </label>
      <label>Offset
        <input id="offset" type="range" min="0" max="1" step="0.001">
      </label>
      <label><input id="auto" type="checkbox"> Auto iterations</label>
      <label>Iterations
        <input id="iters" type="range" min="${Math.log2(MIN_ITER)}" max="${Math.log2(MAX_ITER)}" step="0.01">
        <span id="iters-value"></span>
      </label>
      <div class="buttons">
        <button id="reset" type="button">Reset</button>
        <button id="save" type="button">Save PNG</button>
        <button id="help" type="button" aria-label="Help">?</button>
      </div>
    </div>
    <div class="readout">
      <span id="centre"></span> · zoom 10<sup id="zoom"></sup> · <span id="ceiling"></span> iterations · <span id="time"></span>
    </div>
    <div class="progress" id="progress" hidden><div id="progress-bar"></div></div>
    <div class="help" id="help-overlay" hidden>
      <h2>Mandelbrot viewer</h2>
      <table>${HELP.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
      <p>Press ? or Esc to close.</p>
    </div>`;

  const byId = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`ui element #${id} missing`);
    return el;
  };
  const palette = byId<HTMLSelectElement>('palette');
  const density = byId<HTMLInputElement>('density');
  const offset = byId<HTMLInputElement>('offset');
  const auto = byId<HTMLInputElement>('auto');
  const iters = byId<HTMLInputElement>('iters');
  const itersValue = byId<HTMLSpanElement>('iters-value');
  const centre = byId<HTMLSpanElement>('centre');
  const zoom = byId<HTMLElement>('zoom');
  const ceiling = byId<HTMLSpanElement>('ceiling');
  const time = byId<HTMLSpanElement>('time');
  const progress = byId<HTMLDivElement>('progress');
  const bar = byId<HTMLDivElement>('progress-bar');
  const helpOverlay = byId<HTMLDivElement>('help-overlay');

  palette.addEventListener('change', () => cb.onPalette(palette.value));
  density.addEventListener('input', () => cb.onDensity(10 ** Number(density.value)));
  offset.addEventListener('input', () => cb.onOffset(Number(offset.value)));
  auto.addEventListener('change', () => cb.onMaxIter(auto.checked ? 'auto' : Math.round(2 ** Number(iters.value))));
  iters.addEventListener('input', () => {
    auto.checked = false;
    cb.onMaxIter(Math.round(2 ** Number(iters.value)));
  });
  byId<HTMLButtonElement>('reset').addEventListener('click', () => cb.onReset());
  byId<HTMLButtonElement>('save').addEventListener('click', () => cb.onSave());
  byId<HTMLButtonElement>('help').addEventListener('click', () => cb.onHelp());

  return {
    setView(view, widthCss) {
      palette.value = view.palette;
      density.value = String(Math.log10(view.density));
      offset.value = String(view.offset);
      const max = effectiveMaxIter(view, widthCss);
      auto.checked = view.maxIter === 'auto';
      iters.value = String(Math.log2(max));
      itersValue.textContent = max.toLocaleString();
      centre.textContent = formatCentre(view);
      zoom.textContent = zoomExponent(view, widthCss).toFixed(2);
      ceiling.textContent = max.toLocaleString();
    },
    setProgress(done, total) {
      progress.hidden = false;
      bar.style.width = `${total > 0 ? (100 * done) / total : 0}%`;
    },
    clearProgress() {
      progress.hidden = true;
      bar.style.width = '0%';
    },
    setRenderTime(ms) {
      time.textContent = ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
    },
    toggleHelp() {
      helpOverlay.hidden = !helpOverlay.hidden;
    },
    closeHelp() {
      helpOverlay.hidden = true;
    },
  };
}
```

- [ ] **Step 4: Append to `src/styles.css`**

```css
#ui {
  position: fixed;
  left: 12px;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
#ui > * { pointer-events: auto; }
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  width: fit-content;
  padding: 8px 12px;
  background: rgba(20, 20, 24, 0.82);
  border-radius: 8px;
  backdrop-filter: blur(6px);
}
.toolbar label { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.toolbar input[type="range"] { width: 110px; }
.toolbar select, .toolbar button {
  font: inherit;
  color: inherit;
  background: #2a2a30;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 3px 8px;
}
.toolbar button { cursor: pointer; }
.toolbar button:hover { background: #3a3a42; }
.buttons { display: inline-flex; gap: 6px; }
.readout {
  width: fit-content;
  padding: 4px 10px;
  background: rgba(20, 20, 24, 0.7);
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
.progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
}
#progress-bar { height: 100%; width: 0; background: #6cf; transition: width 120ms linear; }
.help {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.6);
}
.help[hidden] { display: none; }
.help > * { max-width: 420px; }
.help h2 { margin: 0 0 8px; }
.help table { border-collapse: collapse; background: rgba(20, 20, 24, 0.95); border-radius: 8px; padding: 12px; }
.help th { text-align: left; padding: 4px 12px 4px 0; font-weight: 600; }
.help td { padding: 4px 0; }
```

- [ ] **Step 5: Update `src/main.ts`**

Add imports:
```ts
import { toDecimal } from './bigfloat';
import { downloadName } from './filename';
import { PALETTES } from './palette';
import { createUi } from './ui';
import { zoomExponent } from './viewport';
```

Replace `viewFromHash` so unknown palette ids fall back to classic:
```ts
function viewFromHash(hash: string): ViewState {
  const parsed = fromHash(hash) ?? defaultView(target().widthCss);
  return PALETTES.some((p) => p.id === parsed.palette) ? parsed : { ...parsed, palette: 'classic' };
}
```

Replace the scheduler event handlers:
```ts
    onPass(result) {
      latest = result;
      repaint();
      if (result.final) ui.setRenderTime(result.elapsedMs);
    },
    onReferenceStart() { ui.setProgress(0, 1); },
    onReferenceProgress(done, total) { ui.setProgress(done, total); },
    onReferenceDone() { ui.clearProgress(); },
```

Add the UI, the save function, and readout updates. Place the `createUi` call *before* the `Scheduler` construction (the handlers reference `ui`), and declare it with `const ui = createUi(...)`:
```ts
const ui = createUi(document.getElementById('ui') as HTMLElement, PALETTES, {
  onPalette: (id) => setView({ ...view, palette: id }),
  onDensity: (d) => setView({ ...view, density: d }),
  onOffset: (o) => setView({ ...view, offset: o }),
  onMaxIter: (m) => setView({ ...view, maxIter: m }),
  onReset: () => setView(defaultView(target().widthCss)),
  onSave: () => { void save(); },
  onHelp: () => ui.toggleHelp(),
});

async function save(): Promise<void> {
  const blob = await canvasView.toBlob();
  const name = downloadName(zoomExponent(view, target().widthCss), toDecimal(view.centre.re), toDecimal(view.centre.im));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

In `render()` add `ui.setView(view, t.widthCss);` after `renderedView = view;`. In `setView` add `ui.setView(view, target().widthCss);` after the `view = next;` line. Replace the three empty input actions:
```ts
  save: () => { void save(); },
  toggleHelp: () => ui.toggleHelp(),
  closeHelp: () => ui.closeHelp(),
```

Because `setView` is a function declaration it is hoisted, so the `createUi` callbacks may reference it before its definition in source order. `ui` must be initialised before `render()` is first called at the bottom of the file.

- [ ] **Step 6: Run everything**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
```
Expected: lint clean; unit tests pass; build succeeds; Playwright prints `10 passed`.

- [ ] **Step 7: Look at it**

```bash
npm run dev
```
In Chrome: toolbar bottom-left, readout beneath it, `?` shows the help. Zoom in a dozen scroll notches near the boundary; the progress bar appears briefly when the reference recomputes. Change the palette and drag the density slider; colours change instantly. Press `S`; a short-named PNG downloads. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/ui.ts src/main.ts src/styles.css e2e/viewer.spec.ts
git commit -m "feat: toolbar, readout, progress bar, help overlay and PNG save" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

This completes stage one: a correct image at any depth, slow at extreme depth.

---

### Task 14: Bilinear approximation table (`bla.ts`)

**Files:**
- Create: `src/bla.ts`
- Test: `tests/bla.test.ts`

**Interfaces:**
- Consumes: `reference.ts` (`ReferenceOrbit`).
- Produces (decision 4):
  ```ts
  const BLA_EPS = 2 ** -24, NODE_DOUBLES = 5
  interface BlaTable { levels: number; length: number; offsets: readonly number[]; nodes: Float64Array; delta0Max: number }
  interface SharedBlaMeta { buffer: SharedArrayBuffer; levels: number; length: number; delta0Max: number }
  blaLevels(length): number            // largest L with 2^L ≤ length
  levelCount(length, k): number        // floor(length / 2^k) nodes at level k
  blaOffsets(length): number[]         // offsets[k] = first index of level k in `nodes`; offsets[0] unused
  blaNodeCount(length): number
  nodeOffset(table, k, m): number      // index of the five doubles of the level-k node starting at iteration m
  buildBla(ref, delta0Max, out: Float64Array): BlaTable
  lookupLevel(table, m, deltaAbs2): number   // largest k ≥ 1 with 2^k | m, m + 2^k < length and r² > deltaAbs2; else 0
  toBlaMeta(table, buffer): SharedBlaMeta;  fromBlaMeta(meta): BlaTable
  ```
  Node layout: `A.re, A.im, B.re, B.im, r`. Level-k node j covers iterations `[j·2^k, (j+1)·2^k)` and maps `δ ← A·δ + B·δ₀`. Level-0 nodes (`A = 2Z[l], B = 1, r = ε|Z[l]|`) are computed on the fly and never stored. Merge of x then y: `A = A_y·A_x`, `B = A_y·B_x + B_y`, `r = min(r_x, max(0, (r_y − |B_x|·δ₀max) / |A_x|))`, or 0 when `|A_x| = 0`.

- [ ] **Step 1: Write the failing tests**

`tests/bla.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BLA_EPS, blaLevels, blaNodeCount, blaOffsets, buildBla, fromBlaMeta, levelCount, lookupLevel,
  NODE_DOUBLES, nodeOffset, toBlaMeta,
} from '../src/bla';
import { cfromNumbers } from '../src/bigfloat';
import { computeReference, type ReferenceOrbit } from '../src/reference';

function makeRef(cre: number, cim: number, length: number, bits = 128): ReferenceOrbit {
  const z = new Float64Array(2 * length);
  const centre = cfromNumbers(cre, cim, bits);
  const r = computeReference(centre, length, bits, z, () => true);
  return { z, length: r.length, capacity: length, escaped: r.escaped, centre, bits };
}

function makeTable(ref: ReferenceOrbit, delta0Max: number) {
  const out = new Float64Array(blaNodeCount(ref.length) * NODE_DOUBLES);
  return buildBla(ref, delta0Max, out);
}

type Node = [Are: number, Aim: number, Bre: number, Bim: number, r: number];

function mergeNodes(x: Node, y: Node, d0max: number): Node {
  const [xAre, xAim, xBre, xBim, xr] = x;
  const [yAre, yAim, yBre, yBim, yr] = y;
  const axAbs = Math.hypot(xAre, xAim);
  const bxAbs = Math.hypot(xBre, xBim);
  return [
    yAre * xAre - yAim * xAim,
    yAre * xAim + yAim * xAre,
    yAre * xBre - yAim * xBim + yBre,
    yAre * xBim + yAim * xBre + yBim,
    axAbs > 0 ? Math.min(xr, Math.max(0, (yr - bxAbs * d0max) / axAbs)) : 0,
  ];
}

function level0(ref: ReferenceOrbit, l: number): Node {
  const zr = ref.z[2 * l];
  const zi = ref.z[2 * l + 1];
  return [2 * zr, 2 * zi, 1, 0, BLA_EPS * Math.hypot(zr, zi)];
}

function readNode(nodes: Float64Array, o: number): Node {
  return [nodes[o], nodes[o + 1], nodes[o + 2], nodes[o + 3], nodes[o + 4]];
}

let seed = 987654321;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

describe('table shape', () => {
  it('computes levels, counts, offsets and totals', () => {
    expect(blaLevels(1)).toBe(0);
    expect(blaLevels(2)).toBe(1);
    expect(blaLevels(3)).toBe(1);
    expect(blaLevels(4)).toBe(2);
    expect(blaLevels(1024)).toBe(10);
    expect(blaLevels(1025)).toBe(10);
    expect([1, 2, 3].map((k) => levelCount(10, k))).toEqual([5, 2, 1]);
    expect(blaNodeCount(8)).toBe(7);
    expect(blaNodeCount(10)).toBe(8);
    expect(blaOffsets(8)).toEqual([0, 0, 20, 30]);
    expect(blaOffsets(10)).toEqual([0, 0, 25, 35]);
  });
});

describe('buildBla', () => {
  // c = −0.2 + 0.5i sits inside the main cardioid; its orbit converges to a fixed point of
  // modulus ≈ 0.42 and only Z[0] is zero, so node radii stay positive.
  const ref = makeRef(-0.2, 0.5, 64);
  const d0max = 1e-12;
  const table = makeTable(ref, d0max);

  it('stores level-1 nodes as merges of on-the-fly level-0 nodes', () => {
    for (const j of [0, 1, 5, 20, 31]) {
      const expected = mergeNodes(level0(ref, 2 * j), level0(ref, 2 * j + 1), d0max);
      const actual = readNode(table.nodes, nodeOffset(table, 1, 2 * j));
      for (let i = 0; i < 5; i++) expect(actual[i]).toBeCloseTo(expected[i], 12);
    }
    expect(readNode(table.nodes, nodeOffset(table, 1, 0))[4]).toBe(0);
  });

  it('composes higher levels from their two children', () => {
    for (let k = 2; k <= table.levels; k++) {
      for (let j = 0; j < levelCount(ref.length, k); j++) {
        const m = j * 2 ** k;
        const child0 = readNode(table.nodes, nodeOffset(table, k - 1, m));
        const child1 = readNode(table.nodes, nodeOffset(table, k - 1, m + 2 ** (k - 1)));
        const expected = mergeNodes(child0, child1, d0max);
        const actual = readNode(table.nodes, nodeOffset(table, k, m));
        for (let i = 0; i < 5; i++) expect(actual[i]).toBeCloseTo(expected[i], 12);
      }
    }
  });

  it('throws when the output buffer is too small', () => {
    expect(() => buildBla(ref, d0max, new Float64Array(3))).toThrow(RangeError);
  });
});

describe('a skipped step agrees with step-by-step perturbation', () => {
  it('within a relative 1e-4 for offsets inside the node radius', () => {
    const ref = makeRef(-0.2, 0.5, 4096);
    expect(ref.escaped).toBe(false);
    const d0max = 1e-12;
    const table = makeTable(ref, d0max);
    let compared = 0;
    for (let k = 1; k <= 8; k++) {
      for (let trial = 0; trial < 6; trial++) {
        const j = Math.floor(rnd() * levelCount(ref.length, k));
        const m = j * 2 ** k;
        if (m + 2 ** k >= ref.length) continue;
        const [Are, Aim, Bre, Bim, r] = readNode(table.nodes, nodeOffset(table, k, m));
        if (r === 0) continue;
        const th = rnd() * 2 * Math.PI;
        const ph = rnd() * 2 * Math.PI;
        const dre0 = 0.5 * r * Math.cos(th);
        const dim0 = 0.5 * r * Math.sin(th);
        const d0re = 0.5 * d0max * Math.cos(ph);
        const d0im = 0.5 * d0max * Math.sin(ph);
        const linRe = Are * dre0 - Aim * dim0 + Bre * d0re - Bim * d0im;
        const linIm = Are * dim0 + Aim * dre0 + Bre * d0im + Bim * d0re;
        let dre = dre0;
        let dim = dim0;
        for (let i = 0; i < 2 ** k; i++) {
          const Zre = ref.z[2 * (m + i)];
          const Zim = ref.z[2 * (m + i) + 1];
          const nre = 2 * (Zre * dre - Zim * dim) + (dre * dre - dim * dim) + d0re;
          const nim = 2 * (Zre * dim + Zim * dre) + 2 * dre * dim + d0im;
          dre = nre;
          dim = nim;
        }
        const exact = Math.hypot(dre, dim);
        if (exact < 1e-300) continue;
        expect(Math.hypot(linRe - dre, linIm - dim) / exact).toBeLessThan(1e-4);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(20);
  });
});

describe('lookupLevel', () => {
  const ref = makeRef(-0.2, 0.5, 4096);
  const table = makeTable(ref, 1e-12);

  it('never skips from iteration 0 because Z[0] = 0', () => {
    expect(lookupLevel(table, 0, 1e-60)).toBe(0);
  });

  it('returns the largest aligned in-range level whose radius covers the offset', () => {
    const k = lookupLevel(table, 1024, 1e-60);
    expect(k).toBeGreaterThanOrEqual(1);
    expect(1024 % 2 ** k).toBe(0);
    expect(1024 + 2 ** k).toBeLessThan(ref.length);
    const r = table.nodes[nodeOffset(table, k, 1024) + 4];
    expect(r * r).toBeGreaterThan(1e-60);
    for (let kk = k + 1; kk <= table.levels; kk++) {
      if (1024 % 2 ** kk !== 0 || 1024 + 2 ** kk >= ref.length) continue;
      const rr = table.nodes[nodeOffset(table, kk, 1024) + 4];
      expect(rr * rr).toBeLessThanOrEqual(1e-60);
    }
  });

  it('returns 0 for odd iterations, near the end, and for large offsets', () => {
    expect(lookupLevel(table, 1023, 1e-60)).toBe(0);
    expect(lookupLevel(table, ref.length - 2, 1e-60)).toBe(0);
    expect(lookupLevel(table, 1024, 1)).toBe(0);
  });
});

describe('shared metadata', () => {
  it('round-trips through toBlaMeta / fromBlaMeta', () => {
    const ref = makeRef(-0.5, 0, 64);
    const buffer = new SharedArrayBuffer(blaNodeCount(ref.length) * NODE_DOUBLES * 8);
    const table = buildBla(ref, 1e-6, new Float64Array(buffer));
    const back = fromBlaMeta(toBlaMeta(table, buffer));
    expect(back.levels).toBe(table.levels);
    expect(back.length).toBe(64);
    expect(back.offsets).toEqual(table.offsets);
    expect(back.delta0Max).toBe(1e-6);
    expect(back.nodes.buffer).toBe(buffer);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/bla.test.ts
```
Expected: FAIL with `Failed to resolve import "../src/bla"`.

- [ ] **Step 3: Write `src/bla.ts`**

```ts
import type { ReferenceOrbit } from './reference';

export const BLA_EPS = 2 ** -24;
export const NODE_DOUBLES = 5;

/**
 * Bilinear approximation table. Level-k node j covers reference iterations [j·2^k, (j+1)·2^k)
 * and maps δ ← A·δ + B·δ₀, valid while |δ| < r. Level 0 is derived from Z on the fly and not stored.
 */
export interface BlaTable {
  readonly levels: number;
  readonly length: number;
  readonly offsets: readonly number[];
  readonly nodes: Float64Array;
  readonly delta0Max: number;
}

export interface SharedBlaMeta {
  readonly buffer: SharedArrayBuffer;
  readonly levels: number;
  readonly length: number;
  readonly delta0Max: number;
}

export function blaLevels(length: number): number {
  let levels = 0;
  while (2 ** (levels + 1) <= length) levels++;
  return levels;
}

export function levelCount(length: number, k: number): number {
  return Math.floor(length / 2 ** k);
}

export function blaOffsets(length: number): number[] {
  const levels = blaLevels(length);
  const offsets: number[] = new Array<number>(levels + 1).fill(0);
  let acc = 0;
  for (let k = 1; k <= levels; k++) {
    offsets[k] = acc;
    acc += levelCount(length, k) * NODE_DOUBLES;
  }
  return offsets;
}

export function blaNodeCount(length: number): number {
  let total = 0;
  const levels = blaLevels(length);
  for (let k = 1; k <= levels; k++) total += levelCount(length, k);
  return total;
}

export function nodeOffset(table: BlaTable, k: number, m: number): number {
  return table.offsets[k] + (m >> k) * NODE_DOUBLES;
}

function merge(
  out: Float64Array, o: number,
  xAre: number, xAim: number, xBre: number, xBim: number, xr: number,
  yAre: number, yAim: number, yBre: number, yBim: number, yr: number,
  d0max: number,
): void {
  const axAbs = Math.hypot(xAre, xAim);
  const bxAbs = Math.hypot(xBre, xBim);
  out[o] = yAre * xAre - yAim * xAim;
  out[o + 1] = yAre * xAim + yAim * xAre;
  out[o + 2] = yAre * xBre - yAim * xBim + yBre;
  out[o + 3] = yAre * xBim + yAim * xBre + yBim;
  out[o + 4] = axAbs > 0 ? Math.min(xr, Math.max(0, (yr - bxAbs * d0max) / axAbs)) : 0;
}

/** Builds the table for `ref` into `out`, which must hold blaNodeCount(ref.length) × NODE_DOUBLES doubles. */
export function buildBla(ref: ReferenceOrbit, delta0Max: number, out: Float64Array): BlaTable {
  const length = ref.length;
  const levels = blaLevels(length);
  const offsets = blaOffsets(length);
  if (out.length < blaNodeCount(length) * NODE_DOUBLES) throw new RangeError('bla output buffer too small');
  const z = ref.z;
  const count1 = levelCount(length, 1);
  for (let j = 0; j < count1; j++) {
    const l = 2 * j;
    const xre = z[2 * l];
    const xim = z[2 * l + 1];
    const yre = z[2 * l + 2];
    const yim = z[2 * l + 3];
    merge(
      out, offsets[1] + j * NODE_DOUBLES,
      2 * xre, 2 * xim, 1, 0, BLA_EPS * Math.hypot(xre, xim),
      2 * yre, 2 * yim, 1, 0, BLA_EPS * Math.hypot(yre, yim),
      delta0Max,
    );
  }
  for (let k = 2; k <= levels; k++) {
    const count = levelCount(length, k);
    const prev = offsets[k - 1];
    const cur = offsets[k];
    for (let j = 0; j < count; j++) {
      const xo = prev + 2 * j * NODE_DOUBLES;
      const yo = xo + NODE_DOUBLES;
      merge(
        out, cur + j * NODE_DOUBLES,
        out[xo], out[xo + 1], out[xo + 2], out[xo + 3], out[xo + 4],
        out[yo], out[yo + 1], out[yo + 2], out[yo + 3], out[yo + 4],
        delta0Max,
      );
    }
  }
  return { levels, length, offsets, nodes: out, delta0Max };
}

/**
 * Largest level k ≥ 1 such that 2^k divides m, m + 2^k < length and the node's r² exceeds
 * `deltaAbs2`; 0 when no stored node applies. Allocation-free; used in the per-pixel hot loop.
 */
export function lookupLevel(table: BlaTable, m: number, deltaAbs2: number): number {
  const top = m === 0 ? table.levels : Math.min(table.levels, 31 - Math.clz32(m & -m));
  for (let k = top; k >= 1; k--) {
    if (m + (1 << k) >= table.length) continue;
    const r = table.nodes[table.offsets[k] + (m >> k) * NODE_DOUBLES + 4];
    if (deltaAbs2 < r * r) return k;
  }
  return 0;
}

export function toBlaMeta(table: BlaTable, buffer: SharedArrayBuffer): SharedBlaMeta {
  return { buffer, levels: table.levels, length: table.length, delta0Max: table.delta0Max };
}

export function fromBlaMeta(meta: SharedBlaMeta): BlaTable {
  return {
    levels: meta.levels,
    length: meta.length,
    offsets: blaOffsets(meta.length),
    nodes: new Float64Array(meta.buffer),
    delta0Max: meta.delta0Max,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/bla.test.ts
```
Expected: PASS, 9 tests. If the relative-error assertion in the skip test fails, record the largest observed error in the task report before adjusting anything: the spec's 10⁻⁴ is a design statement, and a real excess is a finding to raise, not a number to loosen silently.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/bla.ts tests/bla.test.ts
git commit -m "feat: bilinear approximation table build and lookup" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Integrate BLA into perturbation, workers and scheduler

**Files:**
- Modify: `src/perturb.ts`, `src/render-worker.ts`, `src/reference-worker.ts`, `src/scheduler.ts`, `tests/perturb.test.ts`, `tests/scheduler.test.ts`
- Test: `tests/perturb-bla.test.ts`

**Interfaces:**
- Consumes: `bla.ts` (everything from Task 14).
- Produces (final signatures from the spec):
  ```ts
  // perturb.ts
  const perturbStats: { steps: number; skips: number }     // counters for tests and the readout; callers may reset
  iteratePixel(ref, bla: BlaTable | null, d0re, d0im, maxIter): number
  renderTile(ref, bla: BlaTable | null, job, out): void
  // scheduler.ts protocol additions
  ToReferenceWorker  |= { type: 'rebuildBla'; id: number; delta0Max: number }
  FromReferenceWorker 'done' gains  bla: SharedBlaMeta
  ToRenderWorker 'setShared' gains  bla: SharedBlaMeta | null
  ```
  Scheduler rules (decision 8): with a reusable reference, passes start at once when the held table's `delta0Max` covers `|view.centre − ref.centre| + halfDiagonal`; otherwise a `rebuildBla` is posted for `DELTA0_HEADROOM ×` that need and passes wait for it. A rebuild may be queued behind an in-flight `compute` on the same worker; the rebuild's `done` also carries the reference.

- [ ] **Step 1: Update the perturbation tests for the new signature**

In `tests/perturb.test.ts`, change every `iteratePixel(ref, ` to `iteratePixel(ref, null, ` and every `renderTile(ref, ` to `renderTile(ref, null, `.

- [ ] **Step 2: Write the failing BLA integration tests**

`tests/perturb-bla.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { blaNodeCount, buildBla, NODE_DOUBLES } from '../src/bla';
import { cfromNumbers } from '../src/bigfloat';
import { iterateDouble } from '../src/mandelbrot';
import { iteratePixel, perturbStats, renderTile, type TileJob } from '../src/perturb';
import { computeReference, type ReferenceOrbit } from '../src/reference';
import { autoMaxIter, defaultView, passGeometry, precisionBits, refLength } from '../src/viewport';

function makeRef(cre: number, cim: number, length: number, bits = 128): ReferenceOrbit {
  const z = new Float64Array(2 * length);
  const centre = cfromNumbers(cre, cim, bits);
  const r = computeReference(centre, length, bits, z, () => true);
  return { z, length: r.length, capacity: length, escaped: r.escaped, centre, bits };
}

function makeTable(ref: ReferenceOrbit, delta0Max: number) {
  return buildBla(ref, delta0Max, new Float64Array(blaNodeCount(ref.length) * NODE_DOUBLES));
}

function resetStats() {
  perturbStats.steps = 0;
  perturbStats.skips = 0;
}

describe('iteratePixel with BLA', () => {
  it('skips iterations at depth and still matches the oracle in an exterior region', () => {
    const W = 256;
    const scale = 4 / (W * 1e20);
    const bits = precisionBits(scale);
    const view = { ...defaultView(W), centre: cfromNumbers(0.5, 0.5, bits), scale };
    const maxIter = autoMaxIter(view, W);
    const ref = makeRef(0.5, 0.5, refLength(maxIter), bits);
    const geo = passGeometry(view, ref.centre, 8, W, W);
    const table = makeTable(ref, Math.hypot(geo.originRe, geo.originIm) * 2);
    const expected = iterateDouble(0.5, 0.5, maxIter);
    resetStats();
    const job: TileJob = { generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32, ...geo, maxIter };
    const out = new Float32Array(32 * 32);
    renderTile(ref, table, job, out);
    for (const v of out) expect(Math.abs(v - expected)).toBeLessThan(1e-4);
    expect(perturbStats.skips).toBeGreaterThan(0);
  });

  it('agrees with plain perturbation on quick escapers over the default view', () => {
    const W = 256;
    const view = defaultView(W);
    const ref = makeRef(-0.5, 0, refLength(autoMaxIter(view, W)));
    const geo = passGeometry(view, ref.centre, 8, W, W);
    const table = makeTable(ref, 2 * Math.hypot(geo.originRe, geo.originIm));
    const job: TileJob = { generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32, ...geo, maxIter: 1000 };
    const plain = new Float32Array(32 * 32);
    const fast = new Float32Array(32 * 32);
    renderTile(ref, null, job, plain);
    renderTile(ref, table, job, fast);
    let checked = 0;
    for (let i = 0; i < plain.length; i++) {
      if (plain[i] > 0 && plain[i] < 30) {
        checked++;
        expect(Math.abs(fast[i] - plain[i])).toBeLessThan(1e-4);
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('renders a deep boundary frame with finite values and substantial skipping', () => {
    const W = 64;
    const scale = 4 / (W * 1e40);
    const bits = precisionBits(scale);
    const centre = cfromNumbers(-0.7436438870371587, 0.1318259042053119, bits);
    const view = { ...defaultView(W), centre, scale };
    const maxIter = autoMaxIter(view, W);
    expect(maxIter).toBe(17000);
    const ref = makeRef(-0.7436438870371587, 0.1318259042053119, refLength(maxIter), bits);
    const geo = passGeometry(view, ref.centre, 4, W, W);
    const table = makeTable(ref, 2 * Math.hypot(geo.originRe, geo.originIm));
    const job: TileJob = { generation: 0, pass: 0, x: 0, y: 0, w: 16, h: 16, ...geo, maxIter };
    const fast = new Float32Array(16 * 16);
    resetStats();
    renderTile(ref, table, job, fast);
    for (const v of fast) expect(Number.isFinite(v)).toBe(true);
    expect(perturbStats.skips).toBeGreaterThan(100);
    const plain = new Float32Array(16 * 16);
    renderTile(ref, null, job, plain);
    const exterior = (a: Float32Array) => a.filter((v) => v >= 0).length / a.length;
    expect(Math.abs(exterior(fast) - exterior(plain))).toBeLessThanOrEqual(0.25);
  });

  it('does not skip past maxIter', () => {
    const ref = makeRef(-0.2, 0.5, 4096);
    const table = makeTable(ref, 1e-12);
    expect(iteratePixel(ref, table, 1e-12, 1e-12, 300)).toBe(-1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run tests/perturb.test.ts tests/perturb-bla.test.ts
```
Expected: FAIL. The updated perturb tests fail on the argument shift; the new file fails on `perturbStats` being undefined.

- [ ] **Step 4: Rewrite `src/perturb.ts`**

```ts
import { lookupLevel, nodeOffset, type BlaTable } from './bla';
import { BAILOUT2, smoothNu } from './mandelbrot';
import type { ReferenceOrbit } from './reference';

export interface TileJob {
  readonly generation: number;
  readonly pass: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly originRe: number;
  readonly originIm: number;
  readonly step: number;
  readonly maxIter: number;
}

/** Counters of single perturbation steps and BLA skips since last reset. */
export const perturbStats = { steps: 0, skips: 0 };

/**
 * Perturbation iteration of c = C + δ₀ against reference orbit Z, with rebasing and optional BLA.
 * δ[n+1] = 2·Z[m]·δ[n] + δ[n]² + δ₀ and z = Z[m] + δ. Rebases (δ ← z, m ← 0) when |z| < |δ| or the
 * reference has no next entry. With a table, a valid node maps δ ← A·δ + B·δ₀ across 2^k iterations.
 */
export function iteratePixel(
  ref: ReferenceOrbit, bla: BlaTable | null, d0re: number, d0im: number, maxIter: number,
): number {
  const Z = ref.z;
  const last = ref.length - 1;
  let dre = 0;
  let dim = 0;
  let m = 0;
  let n = 0;
  while (n < maxIter) {
    let Zre = Z[2 * m];
    let Zim = Z[2 * m + 1];
    const zre = Zre + dre;
    const zim = Zim + dim;
    const z2 = zre * zre + zim * zim;
    if (z2 > BAILOUT2) return smoothNu(n, z2);
    let d2 = dre * dre + dim * dim;
    if (m === last || z2 < d2) {
      dre = zre;
      dim = zim;
      m = 0;
      Zre = 0;
      Zim = 0;
      d2 = z2;
    }
    if (bla !== null) {
      const k = lookupLevel(bla, m, d2);
      if (k > 0) {
        const skip = 1 << k;
        if (n + skip <= maxIter) {
          const o = nodeOffset(bla, k, m);
          const nodes = bla.nodes;
          const Are = nodes[o];
          const Aim = nodes[o + 1];
          const Bre = nodes[o + 2];
          const Bim = nodes[o + 3];
          const nre = Are * dre - Aim * dim + Bre * d0re - Bim * d0im;
          const nim = Are * dim + Aim * dre + Bre * d0im + Bim * d0re;
          dre = nre;
          dim = nim;
          n += skip;
          m += skip;
          perturbStats.skips++;
          continue;
        }
      }
    }
    const nre = 2 * (Zre * dre - Zim * dim) + (dre * dre - dim * dim) + d0re;
    const nim = 2 * (Zre * dim + Zim * dre) + 2 * dre * dim + d0im;
    dre = nre;
    dim = nim;
    n++;
    m++;
    perturbStats.steps++;
  }
  return -1;
}

/** Fills `out` (row-major, w × h) with ν values for the tile described by `job`. */
export function renderTile(ref: ReferenceOrbit, bla: BlaTable | null, job: TileJob, out: Float32Array): void {
  let i = 0;
  for (let py = 0; py < job.h; py++) {
    const d0im = job.originIm - (job.y + py) * job.step;
    for (let px = 0; px < job.w; px++) {
      out[i++] = iteratePixel(ref, bla, job.originRe + (job.x + px) * job.step, d0im, job.maxIter);
    }
  }
}
```

- [ ] **Step 5: Run the perturbation tests**

```bash
npx vitest run tests/perturb.test.ts tests/perturb-bla.test.ts
```
Expected: PASS, 11 tests. The deep-frame test computes a 32,768-iteration reference at about 200 bits and should finish within a few seconds.

- [ ] **Step 6: Update `src/scheduler.ts` for the BLA protocol**

Add the import `import type { SharedBlaMeta } from './bla';` and change the protocol types:
```ts
export type ToReferenceWorker =
  | { type: 'compute'; id: number; centre: BigComplex; length: number; bits: number; delta0Max: number }
  | { type: 'rebuildBla'; id: number; delta0Max: number };
export type FromReferenceWorker =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'done'; id: number; ref: SharedRefMeta; bla: SharedBlaMeta };
export type ToRenderWorker =
  | { type: 'setShared'; ref: SharedRefMeta; bla: SharedBlaMeta | null }
  | { type: 'tile'; job: TileJob };
```

Change `PendingReference` to carry the kind and bound:
```ts
interface PendingReference {
  id: number;
  kind: 'compute' | 'rebuild';
  centre: BigComplex;
  capacity: number;
  bits: number;
  delta0Max: number;
}
```

Add a field `private bla: SharedBlaMeta | null = null;` beside `ref`.

Replace `render()`:
```ts
  render(view: ViewState, target: RenderTarget): void {
    this.generation++;
    this.queue = [];
    this.passes.clear();
    this.view = view;
    this.target = target;
    this.startedAt = this.now();
    const need = refLength(effectiveMaxIter(view, target.widthCss));
    const bits = precisionBits(view.scale);
    const half = halfDiagonal(view, target.widthCss, target.heightCss);
    if (this.ref && this.reusable(this.ref.centre, this.ref.capacity, this.ref.bits, view, need, bits, half)) {
      const need0 = this.delta0Needed(this.ref.centre, view, half);
      if (this.bla && need0 <= this.bla.delta0Max) {
        this.cancelPending();
        this.startPasses();
        return;
      }
      if (this.pending?.kind === 'rebuild' && this.pending.delta0Max >= need0) return;
      this.requestRebuild(this.ref.centre, this.ref.capacity, this.ref.bits, DELTA0_HEADROOM * need0);
      return;
    }
    if (this.pending && this.reusable(this.pending.centre, this.pending.capacity, this.pending.bits, view, need, bits, half)) {
      const need0 = this.delta0Needed(this.pending.centre, view, half);
      if (this.pending.delta0Max >= need0) return;
      this.requestRebuild(this.pending.centre, this.pending.capacity, this.pending.bits, DELTA0_HEADROOM * need0);
      return;
    }
    this.requestReference(view.centre, need, bits, DELTA0_HEADROOM * half);
  }
```

Add the helpers and update `requestReference`, `onReferenceMessage`:
```ts
  private delta0Needed(centre: BigComplex, view: ViewState, half: number): number {
    const d = offsetFrom(centre, view);
    return Math.hypot(d.re, d.im) + half;
  }

  /** Drops a pending request. An in-flight compute is terminated; a rebuild is simply ignored on arrival. */
  private cancelPending(): void {
    if (!this.pending) return;
    if (this.pending.kind === 'compute') {
      this.refWorker.terminate();
      this.refWorker = this.createReferenceWorker();
    }
    this.pending = null;
  }

  private requestReference(centre: BigComplex, length: number, bits: number, delta0Max: number): void {
    if (this.pending) {
      this.refWorker.terminate();
      this.refWorker = this.createReferenceWorker();
    }
    const id = this.nextId++;
    this.pending = { id, kind: 'compute', centre, capacity: length, bits, delta0Max };
    this.events.onReferenceStart();
    const msg: ToReferenceWorker = { type: 'compute', id, centre, length, bits, delta0Max };
    this.refWorker.postMessage(msg);
  }

  /** Rebuilds the table for the reference the worker holds (or is computing), queued behind any compute. */
  private requestRebuild(centre: BigComplex, capacity: number, bits: number, delta0Max: number): void {
    const id = this.nextId++;
    this.pending = { id, kind: 'rebuild', centre, capacity, bits, delta0Max };
    this.events.onReferenceStart();
    const msg: ToReferenceWorker = { type: 'rebuildBla', id, delta0Max };
    this.refWorker.postMessage(msg);
  }

  private onReferenceMessage(msg: FromReferenceWorker): void {
    if (!this.pending || msg.id !== this.pending.id) return;
    if (msg.type === 'progress') {
      this.events.onReferenceProgress(msg.done, msg.total);
      return;
    }
    this.pending = null;
    this.ref = msg.ref;
    this.bla = msg.bla;
    this.events.onReferenceDone();
    const shared: ToRenderWorker = { type: 'setShared', ref: msg.ref, bla: msg.bla };
    for (const s of this.slots) s.worker.postMessage(shared);
    if (this.view && this.target) this.startPasses();
  }
```

- [ ] **Step 7: Update the scheduler tests**

In `tests/scheduler.test.ts`:

Replace `fakeRef` with a helper that also fakes the table, and use it in `completeReference` and the superseded test:
```ts
import type { SharedBlaMeta } from '../src/bla';

function fakeDone(msg: ToReferenceWorker, previous?: { ref: SharedRefMeta }): { ref: SharedRefMeta; bla: SharedBlaMeta } {
  if (msg.type === 'compute') {
    const ref: SharedRefMeta = {
      buffer: new SharedArrayBuffer(16 * msg.length), length: msg.length, capacity: msg.length,
      escaped: false, centre: msg.centre, bits: msg.bits,
    };
    return { ref, bla: { buffer: new SharedArrayBuffer(40), levels: 1, length: msg.length, delta0Max: msg.delta0Max } };
  }
  if (!previous) throw new Error('rebuild without a previous reference');
  return { ref: previous.ref, bla: { buffer: new SharedArrayBuffer(40), levels: 1, length: previous.ref.length, delta0Max: msg.delta0Max } };
}
```
In `setup`, keep the last completed reference and answer the last posted reference message of either kind:
```ts
  let lastDone: { ref: SharedRefMeta } | undefined;
  const completeReference = () => {
    const w = refs[refs.length - 1];
    const msg = w.posted[w.posted.length - 1] as ToReferenceWorker;
    const done = fakeDone(msg, lastDone);
    lastDone = done;
    w.receive({ type: 'done', id: msg.id, ...done });
  };
```
In the superseded test replace `s.refs[0].receive({ type: 'done', id: first.id, ref: fakeRef(first) });` with `s.refs[0].receive({ type: 'done', id: first.id, ...fakeDone(first) });`. Remove `fakeRef`.

Add these tests:
```ts
  it('shares the BLA table alongside the reference', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    s.completeReference();
    const shared = s.renders[0].posted[0] as ToRenderWorker;
    expect(shared.type === 'setShared' && shared.bla !== null).toBe(true);
  });

  it('rebuilds the table when zooming out past its bound and waits for it', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    const tilesBefore = s.renders.map((r) => r.tiles().length);
    s.scheduler.render(zoomAbout(view, 64, 32, 1 / 3, W, H), target);
    const last = s.refs[0].posted[s.refs[0].posted.length - 1] as ToReferenceWorker;
    expect(last.type).toBe('rebuildBla');
    expect(last.type === 'rebuildBla' && last.delta0Max).toBeCloseTo(DELTA0_HEADROOM * 3 * halfDiagonal(view, W, H), 12);
    expect(s.renders.map((r) => r.tiles().length)).toEqual(tilesBefore);
    for (const r of s.renders) r.answerOne();
    expect(s.renders.map((r) => r.tiles().length)).toEqual(tilesBefore);
    s.completeReference();
    for (const r of s.renders) {
      const t = r.tiles()[r.tiles().length - 1];
      expect(t.type === 'tile' && t.job.generation).toBe(2);
    }
  });

  it('a small zoom in reuses reference and table with no worker messages', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    const posted = s.refs[0].posted.length;
    s.scheduler.render(zoomAbout(view, 64, 32, 1.05, W, H), target);
    expect(s.refs[0].posted.length).toBe(posted);
  });

  it('cancels a pending rebuild when a later view no longer needs it', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(zoomAbout(view, 64, 32, 1 / 3, W, H), target);
    const rebuild = s.refs[0].posted[s.refs[0].posted.length - 1] as ToReferenceWorker;
    s.scheduler.render(view, target);
    const donesBefore = s.counts.dones;
    s.refs[0].receive({ type: 'done', id: rebuild.id, ...fakeDone(rebuild, { ref: fakeDone(s.refs[0].computes()[0]).ref }) });
    expect(s.counts.dones).toBe(donesBefore);
    expect(s.refs[0].terminated).toBe(false);
  });
```

- [ ] **Step 8: Update `src/render-worker.ts`**

```ts
import { fromBlaMeta, type BlaTable } from './bla';
import { renderTile } from './perturb';
import { fromRefMeta, type ReferenceOrbit } from './reference';
import type { FromRenderWorker, ToRenderWorker } from './scheduler';
import { scope } from './worker-scope';

let ref: ReferenceOrbit | null = null;
let bla: BlaTable | null = null;

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToRenderWorker;
  if (msg.type === 'setShared') {
    ref = fromRefMeta(msg.ref);
    bla = msg.bla ? fromBlaMeta(msg.bla) : null;
    return;
  }
  const { job } = msg;
  const out = new Float32Array(job.w * job.h);
  if (ref) renderTile(ref, bla, job, out);
  else out.fill(-1);
  const reply: FromRenderWorker = { type: 'tile', job, data: out };
  scope.postMessage(reply, [out.buffer]);
};
```

- [ ] **Step 9: Update `src/reference-worker.ts`**

```ts
import { blaNodeCount, buildBla, NODE_DOUBLES, toBlaMeta } from './bla';
import { computeReference, toRefMeta, type ReferenceOrbit } from './reference';
import type { FromReferenceWorker, ToReferenceWorker } from './scheduler';
import { scope } from './worker-scope';

let held: { ref: ReferenceOrbit; buffer: SharedArrayBuffer } | null = null;

function buildTable(ref: ReferenceOrbit, delta0Max: number) {
  const buffer = new SharedArrayBuffer(blaNodeCount(ref.length) * NODE_DOUBLES * 8);
  const table = buildBla(ref, delta0Max, new Float64Array(buffer));
  return toBlaMeta(table, buffer);
}

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToReferenceWorker;
  if (msg.type === 'rebuildBla') {
    if (!held) return;
    const reply: FromReferenceWorker = {
      type: 'done', id: msg.id, ref: toRefMeta(held.ref, held.buffer), bla: buildTable(held.ref, msg.delta0Max),
    };
    scope.postMessage(reply);
    return;
  }
  const buffer = new SharedArrayBuffer(msg.length * 16);
  const z = new Float64Array(buffer);
  const result = computeReference(msg.centre, msg.length, msg.bits, z, (done) => {
    const progress: FromReferenceWorker = { type: 'progress', id: msg.id, done, total: msg.length };
    scope.postMessage(progress);
    return true;
  });
  const ref: ReferenceOrbit = {
    z, length: result.length, capacity: msg.length, escaped: result.escaped, centre: msg.centre, bits: msg.bits,
  };
  held = { ref, buffer };
  const reply: FromReferenceWorker = {
    type: 'done', id: msg.id, ref: toRefMeta(ref, buffer), bla: buildTable(ref, msg.delta0Max),
  };
  scope.postMessage(reply);
};
```

- [ ] **Step 10: Run everything**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
```
Expected: lint clean; all unit tests pass including 4 new scheduler tests; build succeeds; Playwright prints `10 passed`.

- [ ] **Step 11: Look at it at depth**

```bash
npm run dev
```
In Chrome, paste this into the address bar to open a deep view near the classic seahorse-valley target, then zoom a few notches further:

```
http://localhost:5173/#re=-0.74364388703715870475219150611477&im=0.13182590420531197049313205638514&s=1e-42&i=auto&p=classic&d=1&o=0
```
The readout shows zoom 10^≈40 and 17,000 iterations. The progress bar appears while the reference computes; the full-resolution frame completes in seconds rather than minutes, with sharp filaments and no blocky noise. Raise density to recover detail if the frame looks flat. Stop the server.

- [ ] **Step 12: Commit**

```bash
git add src/perturb.ts src/scheduler.ts src/render-worker.ts src/reference-worker.ts tests/perturb.test.ts tests/perturb-bla.test.ts tests/scheduler.test.ts
git commit -m "feat: bilinear approximation in the pixel loop, workers and scheduler" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

This completes stage two.

---

### Task 16: Record commands, architecture and usage

**Files:**
- Modify: `AGENTS.md` (Commands, Conventions, Architecture sections), `.gravity/verification.md`, `README.md`

**Interfaces:**
- Produces: the verification commands the lifecycle policy points at, with the output a healthy run prints. The owner approved the agent editing `.gravity/verification.md` on 2026-09-17 (spec, Flagged concerns).

- [ ] **Step 1: Capture healthy output**

```bash
npm run lint; echo "lint exit $?"
npm test 2>&1 | tail -6
npm run build 2>&1 | tail -8
npm run test:e2e 2>&1 | tail -4
```
Keep the tail lines; they go into the documents below in place of the bracketed examples.

- [ ] **Step 2: Replace the Commands, Conventions and Architecture sections of `AGENTS.md`**

Keep the file's other sections unchanged. Replace the three sections' bodies with:

```markdown
## Commands

One-time setup: `npm install` then `npx playwright install chromium`.

- `npm run lint` — `eslint . && tsc --noEmit`. Healthy: no output, exit 0.
- `npm test` — `vitest run`. Healthy: `Test Files  N passed (N)` and `Tests  M passed (M)` [paste the real counts].
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
```

- [ ] **Step 3: Replace `.gravity/verification.md`**

```markdown
# Verifying your work

Run every applicable check before reporting a task complete, and paste the
output. If a check fails, fix the code, not the check. Never skip or delete a
failing test.

One-time setup: `npm install` then `npx playwright install chromium`.

| Command | What it runs | Healthy output |
|---|---|---|
| `npm run lint` | `eslint . && tsc --noEmit` | nothing, exit 0 |
| `npm test` | `vitest run` | `Test Files  N passed (N)`, `Tests  M passed (M)` [paste real counts] |
| `npm run build` | `vite build` | `✓ built in …` with a `dist/` listing |
| `npm run test:e2e` | `playwright test` against the dev server it starts | `10 passed` |

The end-to-end walkthrough in the design's Verification section is run by a
person in Chrome against `npm run dev`.
```

- [ ] **Step 4: Replace `README.md`**

````markdown
# wibble

A personal Mandelbrot fractal generator and viewer for Chrome, with zoom to extreme depth via
perturbation and bilinear approximation.

```bash
npm install
npx playwright install chromium   # once, for the browser test
npm run dev                       # http://localhost:5173/
```

Scroll to zoom about the cursor, drag to pan, double-click to zoom in, `R` to reset, `S` to save a
PNG, `?` for the full key list. Every view is in the URL, so bookmarks and the back button work.

Design: `docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md`.
````

- [ ] **Step 5: Verify and commit**

```bash
npm run lint && npm test
git add AGENTS.md .gravity/verification.md README.md
git commit -m "docs: record commands, conventions, architecture and verification" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Final verification and hand-over

**Files:**
- Modify: `docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md` (Status date only, unless a statement was found wrong during the build, in which case replace it)

- [ ] **Step 1: Run every verification command from a clean tree and keep the output**

```bash
git status --short
npm run lint && npm test && npm run build && npm run test:e2e
```
Expected: an empty status, and all four green. Paste the output into the task report verbatim.

- [ ] **Step 2: Walk through the design's Verification section**

Start `npm run dev` and follow the eight numbered steps in `spec.md` → Verification in Chrome. Record for each step whether it held. Step 4 (full-resolution frame under ten seconds at zoom exponent 60 with the ceiling above 25,000) is a performance claim; record the actual time from the readout. Any step that does not hold is a finding: fix it if it is a defect in the build, or replace the spec statement if the design claim was wrong, and say which in the report.

- [ ] **Step 3: Confirm the spec is current**

If any statement in `spec.md` was replaced during the build, set the Status line's date to today. Otherwise leave it. Commit only if changed:
```bash
git add docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md
git commit -m "docs: confirm design current after build" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand over**

Report to the user: the branch name, the commit list (`git log --oneline main..HEAD`), the pasted verification output, the walkthrough results including the measured step-4 time, and any spec statements replaced. Then stop. Pushing the branch and opening the pull request need the user's explicit permission under the repository policy; the pull request body should link the intent (#1), the acceptance (#3), the spec and this plan, and end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Self-review against the spec

**Spec coverage.** Decision 1 → Tasks 1, 11. Decision 2 → 9, 11. Decision 3 → 7. Decision 4 → 14, 15. Decision 5 → 2, 6. Decision 6 → 9, 11, 15. Decision 7 → 1, 11. Decision 8 → 9, 15. Decision 9 → 9. Decision 10 → 9, 11. Decision 11 → 3, 7. Decision 12 → 8, 13. Decision 13 → 4, 13. Decision 14 → 5, 10, 12. Decision 15 → 4. Decision 16 → 12. Decision 17 → 10, 13. Decision 18 → 13. Decision 19 → 3, 7. Decision 20 → 4 (`SCALE_MIN`). Decision 21 → 1. Decision 22 → task order. Files and interfaces → every module has a task; `worker-scope.ts` and `filename.ts` are additions the spec's layout should list (Task 17 replaces the layout block if it does not). Verification commands → 16. End-to-end walkthrough → 17.

**Placeholder scan.** No TBD/TODO. Every code step contains the code. The only bracketed text is in Task 16, where real command output is pasted in.

**Type consistency.** `TileJob` fields (`generation, pass, x, y, w, h, originRe, originIm, step, maxIter`) are identical in Tasks 7, 9, 15. `SharedRefMeta` carries `capacity` from Task 6 onward and the scheduler's `reusable` reads `capacity`. `passGeometry` returns `{ originRe, originIm, step }` and is spread into `TileJob` in tests. `PassResult.stepCss` is what `CanvasView.paint` receives. `iteratePixel`/`renderTile` gain the `bla` parameter in Task 15 and every caller (render worker, tests) is updated in that task. `fromHash` returns `ViewState | null`; `main.ts` wraps it with a default. The protocol `done` message carries `bla` from Task 15; before that it does not, and the render worker of Task 11 does not read it.
