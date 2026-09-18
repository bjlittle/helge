import { lookupLevel, nodeOffset, type BlaTable } from './bla';
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

/** Counters of single perturbation steps and BLA skips since last reset. */
export const perturbStats = { steps: 0, skips: 0 };

/**
 * Perturbation iteration of c = C + δ₀ against reference orbit Z, with rebasing and optional BLA.
 * δ[n+1] = 2·Z[m]·δ[n] + δ[n]² + δ₀ and z = Z[m] + δ. Rebases (δ ← z, m ← 0) when |z| < |δ| or the
 * reference has no next entry. With a table, a valid node maps δ ← A·δ + B·δ₀ across 2^k iterations.
 */
export function iteratePixel(
  ref: ReferenceOrbit, bla: BlaTable | null, d0re: number, d0im: number, maxIter: number,
): number {
  const Z = ref.z;
  const last = ref.length - 1;
  let dre = 0;
  let dim = 0;
  let m = 0;
  let n = 0;
  while (n < maxIter) {
    let Zre = Z[2 * m];
    let Zim = Z[2 * m + 1];
    const zre = Zre + dre;
    const zim = Zim + dim;
    const z2 = zre * zre + zim * zim;
    if (z2 > BAILOUT2) return smoothNu(n, z2);
    let d2 = dre * dre + dim * dim;
    if (m === last || z2 < d2) {
      dre = zre;
      dim = zim;
      m = 0;
      Zre = 0;
      Zim = 0;
      d2 = z2;
    }
    if (bla !== null) {
      const k = lookupLevel(bla, m, d2);
      if (k > 0) {
        const skip = 1 << k;
        if (n + skip <= maxIter) {
          const o = nodeOffset(bla, k, m);
          const nodes = bla.nodes;
          const Are = nodes[o];
          const Aim = nodes[o + 1];
          const Bre = nodes[o + 2];
          const Bim = nodes[o + 3];
          const nre = Are * dre - Aim * dim + Bre * d0re - Bim * d0im;
          const nim = Are * dim + Aim * dre + Bre * d0im + Bim * d0re;
          dre = nre;
          dim = nim;
          n += skip;
          m += skip;
          perturbStats.skips++;
          continue;
        }
      }
    }
    const nre = 2 * (Zre * dre - Zim * dim) + (dre * dre - dim * dim) + d0re;
    const nim = 2 * (Zre * dim + Zim * dre) + 2 * dre * dim + d0im;
    dre = nre;
    dim = nim;
    n++;
    m++;
    perturbStats.steps++;
  }
  return -1;
}

/** Fills `out` (row-major, w × h) with ν values for the tile described by `job`. */
export function renderTile(ref: ReferenceOrbit, bla: BlaTable | null, job: TileJob, out: Float32Array): void {
  let i = 0;
  for (let py = 0; py < job.h; py++) {
    const d0im = job.originIm - (job.y + py) * job.step;
    for (let px = 0; px < job.w; px++) {
      out[i++] = iteratePixel(ref, bla, job.originRe + (job.x + px) * job.step, d0im, job.maxIter);
    }
  }
}
