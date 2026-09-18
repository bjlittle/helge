import { describe, expect, it } from 'vitest';
import { downloadName, hash8 } from '../src/filename';

describe('hash8', () => {
  it('is deterministic, 8 lowercase hex digits, and input-sensitive', () => {
    expect(hash8('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash8('abc')).toBe(hash8('abc'));
    expect(hash8('abc')).not.toBe(hash8('abd'));
    expect(hash8('')).toBe('811c9dc5');
  });
});

describe('downloadName', () => {
  it('stays short at any depth and encodes the exponent', () => {
    const re = '-0.' + '7'.repeat(300);
    const im = '0.' + '1'.repeat(300);
    const name = downloadName(123.456, re, im);
    expect(name).toMatch(/^mandelbrot-e123\.5-[0-9a-f]{8}\.png$/);
    expect(name.length).toBeLessThan(40);
    expect(downloadName(-0.4, '-0.5', '0')).toMatch(/^mandelbrot-e-0\.4-[0-9a-f]{8}\.png$/);
  });
});
