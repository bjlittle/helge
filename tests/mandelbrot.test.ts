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
