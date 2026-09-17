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
