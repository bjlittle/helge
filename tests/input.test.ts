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
