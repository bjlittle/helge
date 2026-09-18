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
