import { BAILOUT2, smoothNu } from './mandelbrot';
import type { ReferenceOrbit } from './reference';

export interface TileJob {
  readonly generation: number;
  readonly pass: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly originRe: number;
  readonly originIm: number;
  readonly step: number;
  readonly maxIter: number;
}

/**
 * Perturbation iteration of the point c = C + δ₀ against reference orbit Z.
 * δ[n+1] = 2·Z[m]·δ[n] + δ[n]² + δ₀, with z = Z[m] + δ. Rebases (δ ← z, m ← 0) when
 * |z| < |δ| or when the reference orbit has no next entry.
 */
export function iteratePixel(ref: ReferenceOrbit, d0re: number, d0im: number, maxIter: number): number {
  const Z = ref.z;
  const last = ref.length - 1;
  let dre = 0;
  let dim = 0;
  let m = 0;
  for (let n = 0; n < maxIter; n++) {
    let Zre = Z[2 * m];
    let Zim = Z[2 * m + 1];
    const zre = Zre + dre;
    const zim = Zim + dim;
    const z2 = zre * zre + zim * zim;
    if (z2 > BAILOUT2) return smoothNu(n, z2);
    if (m === last || z2 < dre * dre + dim * dim) {
      dre = zre;
      dim = zim;
      m = 0;
      Zre = 0;
      Zim = 0;
    }
    const nre = 2 * (Zre * dre - Zim * dim) + (dre * dre - dim * dim) + d0re;
    const nim = 2 * (Zre * dim + Zim * dre) + 2 * dre * dim + d0im;
    dre = nre;
    dim = nim;
    m++;
  }
  return -1;
}

/** Fills `out` (row-major, w × h) with ν values for the tile described by `job`. */
export function renderTile(ref: ReferenceOrbit, job: TileJob, out: Float32Array): void {
  let i = 0;
  for (let py = 0; py < job.h; py++) {
    const d0im = job.originIm - (job.y + py) * job.step;
    for (let px = 0; px < job.w; px++) {
      out[i++] = iteratePixel(ref, job.originRe + (job.x + px) * job.step, d0im, job.maxIter);
    }
  }
}
