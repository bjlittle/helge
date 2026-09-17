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
