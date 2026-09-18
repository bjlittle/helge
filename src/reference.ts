import { cadd, crebits, csqr, czero, toNumber, type BigComplex } from './bigfloat';
import { BAILOUT2 } from './mandelbrot';

export const CHUNK = 4096;

export interface ReferenceOrbit {
  readonly z: Float64Array; // interleaved re, im
  readonly length: number; // entries stored, at least 2
  readonly capacity: number; // entries requested
  readonly escaped: boolean;
  readonly centre: BigComplex;
  readonly bits: number;
}

export interface SharedRefMeta {
  readonly buffer: SharedArrayBuffer;
  readonly length: number;
  readonly capacity: number;
  readonly escaped: boolean;
  readonly centre: BigComplex;
  readonly bits: number;
}

export interface ReferenceResult {
  readonly length: number;
  readonly escaped: boolean;
  readonly aborted: boolean;
}

/**
 * Computes Z[n+1] = Z[n]² + C in fixed point and stores each Z[n] as doubles into `out`.
 * Stops after storing the first entry beyond the bailout. Calls `onChunk(done)` every
 * CHUNK iterations; a false return aborts.
 */
export function computeReference(
  centre: BigComplex,
  length: number,
  bits: number,
  out: Float64Array,
  onChunk: (done: number) => boolean,
): ReferenceResult {
  if (length < 2) throw new RangeError('reference length must be at least 2');
  if (out.length < 2 * length) throw new RangeError('reference output buffer too small');
  const c = crebits(centre, bits);
  let z = czero(bits);
  for (let n = 0; n < length; n++) {
    const zr = toNumber(z.re);
    const zi = toNumber(z.im);
    out[2 * n] = zr;
    out[2 * n + 1] = zi;
    if (zr * zr + zi * zi > BAILOUT2) return { length: n + 1, escaped: true, aborted: false };
    if (n === length - 1) break;
    z = cadd(csqr(z), c);
    if ((n + 1) % CHUNK === 0 && !onChunk(n + 1)) return { length: n + 1, escaped: false, aborted: true };
  }
  return { length, escaped: false, aborted: false };
}

export function toRefMeta(ref: ReferenceOrbit, buffer: SharedArrayBuffer): SharedRefMeta {
  return {
    buffer, length: ref.length, capacity: ref.capacity, escaped: ref.escaped, centre: ref.centre, bits: ref.bits,
  };
}

export function fromRefMeta(meta: SharedRefMeta): ReferenceOrbit {
  return {
    z: new Float64Array(meta.buffer),
    length: meta.length,
    capacity: meta.capacity,
    escaped: meta.escaped,
    centre: meta.centre,
    bits: meta.bits,
  };
}
