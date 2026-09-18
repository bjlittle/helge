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
