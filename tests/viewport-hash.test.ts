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
