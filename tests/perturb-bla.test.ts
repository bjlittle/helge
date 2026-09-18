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
    for (let i = 0; i < fast.length; i++) expect(Math.abs(fast[i] - plain[i])).toBeLessThan(1e-3);
  });

  it('agrees with plain perturbation across a varying field at zoom exponent 12', () => {
    const W = 64;
    const scale = 4 / (W * 1e12);
    const bits = precisionBits(scale);
    const centre = cfromNumbers(-0.7436438870371587, 0.1318259042053119, bits);
    const view = { ...defaultView(W), centre, scale };
    const maxIter = autoMaxIter(view, W);
    const ref = makeRef(-0.7436438870371587, 0.1318259042053119, refLength(maxIter), bits);
    const geo = passGeometry(view, ref.centre, 4, W, W);
    const table = makeTable(ref, 2 * Math.hypot(geo.originRe, geo.originIm));
    const job: TileJob = { generation: 0, pass: 0, x: 0, y: 0, w: 16, h: 16, ...geo, maxIter };
    const plain = new Float32Array(16 * 16);
    const fast = new Float32Array(16 * 16);
    renderTile(ref, null, job, plain);
    resetStats();
    renderTile(ref, table, job, fast);
    expect(perturbStats.skips).toBeGreaterThan(100);
    const exterior = Array.from(plain).filter((v) => v >= 0);
    expect(exterior.length).toBeGreaterThan(50);
    expect(Math.max(...exterior) - Math.min(...exterior)).toBeGreaterThan(1);
    let agree = 0;
    for (let i = 0; i < plain.length; i++) {
      if ((plain[i] < 0 && fast[i] < 0) || Math.abs(plain[i] - fast[i]) < 1e-2) agree++;
    }
    expect(agree / plain.length).toBeGreaterThanOrEqual(0.95);
  });

  it('does not skip past maxIter', () => {
    const ref = makeRef(-0.2, 0.5, 4096);
    const table = makeTable(ref, 1e-12);
    expect(iteratePixel(ref, table, 1e-12, 1e-12, 300)).toBe(-1);
  });
});
