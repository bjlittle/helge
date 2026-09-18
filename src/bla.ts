import type { ReferenceOrbit } from './reference';

export const BLA_EPS = 2 ** -24;
export const NODE_DOUBLES = 5;

/**
 * Bilinear approximation table. Level-k node j covers reference iterations [j·2^k, (j+1)·2^k)
 * and maps δ ← A·δ + B·δ₀, valid while |δ| < r. Level 0 is derived from Z on the fly and not stored.
 */
export interface BlaTable {
  readonly levels: number;
  readonly length: number;
  readonly offsets: readonly number[];
  readonly nodes: Float64Array;
  readonly delta0Max: number;
}

export interface SharedBlaMeta {
  readonly buffer: SharedArrayBuffer;
  readonly levels: number;
  readonly length: number;
  readonly delta0Max: number;
}

export function blaLevels(length: number): number {
  let levels = 0;
  while (2 ** (levels + 1) <= length) levels++;
  return levels;
}

export function levelCount(length: number, k: number): number {
  return Math.floor(length / 2 ** k);
}

export function blaOffsets(length: number): number[] {
  const levels = blaLevels(length);
  const offsets: number[] = new Array<number>(levels + 1).fill(0);
  let acc = 0;
  for (let k = 1; k <= levels; k++) {
    offsets[k] = acc;
    acc += levelCount(length, k) * NODE_DOUBLES;
  }
  return offsets;
}

export function blaNodeCount(length: number): number {
  let total = 0;
  const levels = blaLevels(length);
  for (let k = 1; k <= levels; k++) total += levelCount(length, k);
  return total;
}

export function nodeOffset(table: BlaTable, k: number, m: number): number {
  return table.offsets[k] + (m >> k) * NODE_DOUBLES;
}

function merge(
  out: Float64Array, o: number,
  xAre: number, xAim: number, xBre: number, xBim: number, xr: number,
  yAre: number, yAim: number, yBre: number, yBim: number, yr: number,
  d0max: number,
): void {
  const axAbs = Math.hypot(xAre, xAim);
  const bxAbs = Math.hypot(xBre, xBim);
  out[o] = yAre * xAre - yAim * xAim;
  out[o + 1] = yAre * xAim + yAim * xAre;
  out[o + 2] = yAre * xBre - yAim * xBim + yBre;
  out[o + 3] = yAre * xBim + yAim * xBre + yBim;
  const bound = (yr - bxAbs * d0max) / axAbs;
  out[o + 4] = axAbs > 0 && Number.isFinite(bound) ? Math.min(xr, Math.max(0, bound)) : 0;
}

/** Builds the table for `ref` into `out`, which must hold blaNodeCount(ref.length) × NODE_DOUBLES doubles. */
export function buildBla(ref: ReferenceOrbit, delta0Max: number, out: Float64Array): BlaTable {
  const length = ref.length;
  const levels = blaLevels(length);
  const offsets = blaOffsets(length);
  if (out.length < blaNodeCount(length) * NODE_DOUBLES) throw new RangeError('bla output buffer too small');
  const z = ref.z;
  const count1 = levelCount(length, 1);
  for (let j = 0; j < count1; j++) {
    const l = 2 * j;
    const xre = z[2 * l];
    const xim = z[2 * l + 1];
    const yre = z[2 * l + 2];
    const yim = z[2 * l + 3];
    merge(
      out, offsets[1] + j * NODE_DOUBLES,
      2 * xre, 2 * xim, 1, 0, BLA_EPS * Math.hypot(xre, xim),
      2 * yre, 2 * yim, 1, 0, BLA_EPS * Math.hypot(yre, yim),
      delta0Max,
    );
  }
  for (let k = 2; k <= levels; k++) {
    const count = levelCount(length, k);
    const prev = offsets[k - 1];
    const cur = offsets[k];
    for (let j = 0; j < count; j++) {
      const xo = prev + 2 * j * NODE_DOUBLES;
      const yo = xo + NODE_DOUBLES;
      merge(
        out, cur + j * NODE_DOUBLES,
        out[xo], out[xo + 1], out[xo + 2], out[xo + 3], out[xo + 4],
        out[yo], out[yo + 1], out[yo + 2], out[yo + 3], out[yo + 4],
        delta0Max,
      );
    }
  }
  return { levels, length, offsets, nodes: out, delta0Max };
}

/**
 * Largest level k ≥ 1 such that 2^k divides m, m + 2^k < length and the node's r² exceeds
 * `deltaAbs2`; 0 when no stored node applies. Allocation-free; used in the per-pixel hot loop.
 */
export function lookupLevel(table: BlaTable, m: number, deltaAbs2: number): number {
  const top = m === 0 ? table.levels : Math.min(table.levels, 31 - Math.clz32(m & -m));
  for (let k = top; k >= 1; k--) {
    if (m + (1 << k) >= table.length) continue;
    const r = table.nodes[table.offsets[k] + (m >> k) * NODE_DOUBLES + 4];
    if (deltaAbs2 < r * r) return k;
  }
  return 0;
}

export function toBlaMeta(table: BlaTable, buffer: SharedArrayBuffer): SharedBlaMeta {
  return { buffer, levels: table.levels, length: table.length, delta0Max: table.delta0Max };
}

export function fromBlaMeta(meta: SharedBlaMeta): BlaTable {
  return {
    levels: meta.levels,
    length: meta.length,
    offsets: blaOffsets(meta.length),
    nodes: new Float64Array(meta.buffer),
    delta0Max: meta.delta0Max,
  };
}
