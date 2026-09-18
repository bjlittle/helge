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

describe('radius rule under an expanding reference', () => {
  // c = i is a Misiurewicz point: the orbit is exactly 0, i, −1+i, −i, −1+i, −i, …
  // so |2Z| ≥ 2 forever and the composite radius is limited by the child bound, not by r_x.
  const ref = makeRef(0, 1, 4096);
  const d0max = 1e-12;
  const table = makeTable(ref, d0max);

  it('has an exactly periodic, non-escaping reference', () => {
    expect(ref.escaped).toBe(false);
    expect(ref.length).toBe(4096);
    expect([ref.z[4], ref.z[5], ref.z[6], ref.z[7]]).toEqual([-1, 1, 0, -1]);
  });

  it('applies the child bound and the δ₀ subtraction at level 1', () => {
    // node j = 1 covers iterations 2 and 3: x = Z[2] = −1+i, y = Z[3] = −i
    const r = table.nodes[nodeOffset(table, 1, 2) + 4];
    expect(r).toBeCloseTo((BLA_EPS - d0max) / (2 * Math.SQRT2), 20);
  });

  it('shrinks radii with level and never stores a negative radius', () => {
    let binding = 0;
    for (let k = 2; k <= table.levels; k++) {
      for (let j = 0; j < levelCount(ref.length, k); j++) {
        const m = j * 2 ** k;
        const rx = table.nodes[nodeOffset(table, k - 1, m) + 4];
        const r = table.nodes[nodeOffset(table, k, m) + 4];
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(rx);
        if (rx > 0 && r < rx) binding++;
      }
    }
    expect(binding).toBeGreaterThan(100);
  });

  it('is radius-limited: lookupLevel stops below the alignment cap', () => {
    const m = 1024;
    const radii = Array.from({ length: 10 }, (_, i) => table.nodes[nodeOffset(table, i + 1, m) + 4]);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]);
    expect(radii[0]).toBeGreaterThan(0);
    expect(radii[9]).toBe(0);
    const k = lookupLevel(table, m, 0);
    expect(k).toBeGreaterThanOrEqual(1);
    expect(k).toBeLessThan(10);
    expect(radii[k - 1]).toBeGreaterThan(0);
    expect(radii[k]).toBe(0);
  });
});

describe('overflowing amplification', () => {
  // Z[0] = 0, Z[1..7] = 1, Z[8..15] = 1e200: the level-1 node over Z[8],Z[9] already has
  // A = (2e200)^2 = Infinity, with a finite radius; the level-2 node over 8..11 composes two
  // such nodes, so A and B are infinite there too, and its radius clamps to 0 through the
  // ordinary min/max clamp (finite / Infinity = 0). The level-3 node over 8..15 then composes
  // two infinite-radius-0 children, so its bound is (0 − Infinity·δ₀max) / Infinity = −∞/∞ = NaN,
  // which only the Number.isFinite guard in `merge` turns into a stored radius of 0.
  it('stores radius 0, not NaN, when a composite bound overflows', () => {
    const length = 16;
    const z = new Float64Array(2 * length);
    for (let l = 1; l <= 7; l++) z[2 * l] = 1;
    for (let l = 8; l <= 15; l++) z[2 * l] = 1e200;
    const ref: ReferenceOrbit = {
      z, length, capacity: length, escaped: false, centre: cfromNumbers(0, 0, 128), bits: 128,
    };
    const table = makeTable(ref, 1e-12);
    expect(table.nodes[nodeOffset(table, 2, 8)]).toBe(Infinity);
    const r = table.nodes[nodeOffset(table, 3, 8) + 4];
    expect(r).toBe(0);
    expect(Number.isNaN(r)).toBe(false);
  });
});
