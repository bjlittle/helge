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
      const actual = iteratePixel(ref, null, cre - -0.1, cim - 0.75, 100);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
    }
  });

  it('rebases when the reference orbit runs out', () => {
    const ref = makeRef(1, 0, 64);
    expect(ref.escaped).toBe(true);
    expect(ref.length).toBe(6);
    const expected = iterateDouble(0.5, 0.5, 100);
    const actual = iteratePixel(ref, null, 0.5 - 1, 0.5 - 0, 100);
    expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
    expect(iteratePixel(ref, null, -1 - 1, 0, 300)).toBe(-1);
  });

  it('reports interior pixels as −1', () => {
    const ref = makeRef(-0.1, 0.75, 1024);
    expect(iteratePixel(ref, null, 0, 0, 1000)).toBe(-1);
    expect(iteratePixel(ref, null, 0.1, -0.75, 1000)).toBe(-1);
    expect(iteratePixel(ref, null, -0.9, -0.75, 1000)).toBe(-1);
  });

  it('is exact for a tiny offset from an exterior reference', () => {
    const ref = makeRef(0.5, 0.5, 64);
    const d0 = 1e-9;
    const expected = iterateDouble(0.5 + d0, 0.5 - d0, 100);
    expect(Math.abs(iteratePixel(ref, null, d0, -d0, 100) - expected)).toBeLessThan(1e-6);
  });

  it('rebases at the last reference entry with a two-entry reference', () => {
    const ref = makeRef(-0.5, 0, 2);
    expect(ref.length).toBe(2);
    expect(ref.escaped).toBe(false);
    const expected = iterateDouble(0.5, 0.5, 100);
    expect(Math.abs(iteratePixel(ref, null, 0.5 - -0.5, 0.5 - 0, 100) - expected)).toBeLessThan(1e-6);
    expect(iteratePixel(ref, null, 0.4, 0.75, 300)).toBe(-1);
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
    renderTile(ref, null, job, out);
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

  it('distinguishes the vertical direction on an off-axis frame', () => {
    const W = 256;
    const scale = 4 / (W * 10);
    const bits = precisionBits(scale);
    const view = { ...defaultView(W), centre: cfromNumbers(0.3, 0.6, bits), scale };
    const ref = makeRef(0.3, 0.6, 1024, bits);
    const geo = passGeometry(view, ref.centre, 8, W, W);
    const job: TileJob = { generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32, ...geo, maxIter: 1000 };
    const out = new Float32Array(32 * 32);
    renderTile(ref, null, job, out);
    let checked = 0;
    let asymmetric = 0;
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const re = 0.3 + geo.originRe + px * geo.step;
        const dim = geo.originIm - py * geo.step;
        const expected = iterateDouble(re, 0.6 + dim, 1000);
        if (expected > 0 && expected < 30) {
          checked++;
          expect(Math.abs(out[py * 32 + px] - expected)).toBeLessThan(1e-4);
          if (Math.abs(iterateDouble(re, 0.6 - dim, 1000) - expected) > 1e-3) asymmetric++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(asymmetric).toBeGreaterThan(50);
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
    renderTile(ref, null, job, out);
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const expected = iterateDouble(0.5 + geo.originRe + px * geo.step, 0.5 + geo.originIm - py * geo.step, maxIter);
        expect(expected).toBeGreaterThan(5);
        expect(expected).toBeLessThan(12);
        expect(Math.abs(out[py * 32 + px] - expected)).toBeLessThan(1e-4);
      }
    }
    const corners: [number, number][] = [[0, 0], [31, 0], [0, 31], [31, 31]];
    const values = corners.map(([px, py]) => {
      const d0re = geo.originRe + px * geo.step;
      const d0im = geo.originIm - py * geo.step;
      const expected = iterateDouble(0.5 + d0re, 0.5 + d0im, maxIter);
      expect(Math.abs(iteratePixel(ref, null, d0re, d0im, maxIter) - expected)).toBeLessThan(1e-9);
      return expected;
    });
    expect(Math.abs(values[0] - values[3])).toBeGreaterThan(1e-8);
  });

  it('honours the tile offset within a pass', () => {
    const ref = makeRef(-0.5, 0, 1024);
    const view = defaultView(256);
    const geo = passGeometry(view, ref.centre, 8, 256, 256);
    const whole = new Float32Array(32 * 32);
    renderTile(ref, null, { generation: 0, pass: 0, x: 0, y: 0, w: 32, h: 32, ...geo, maxIter: 500 }, whole);
    const part = new Float32Array(8 * 8);
    renderTile(ref, null, { generation: 0, pass: 0, x: 16, y: 8, w: 8, h: 8, ...geo, maxIter: 500 }, part);
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        expect(part[py * 8 + px]).toBe(whole[(8 + py) * 32 + 16 + px]);
      }
    }
  });
});
