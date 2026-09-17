export const BAILOUT = 256;
export const BAILOUT2 = BAILOUT * BAILOUT;
const LN_BAILOUT = Math.log(BAILOUT);

/** Smooth escape-time value ν = n − log2(ln|z| / ln R), given |z|². */
export function smoothNu(n: number, zAbs2: number): number {
  return n - Math.log2((0.5 * Math.log(zAbs2)) / LN_BAILOUT);
}

/** Plain double-precision escape-time iteration. Test oracle and shallow-zoom reference. */
export function iterateDouble(cre: number, cim: number, maxIter: number): number {
  let zr = 0;
  let zi = 0;
  for (let n = 0; n < maxIter; n++) {
    const zr2 = zr * zr;
    const zi2 = zi * zi;
    const abs2 = zr2 + zi2;
    if (abs2 > BAILOUT2) return smoothNu(n, abs2);
    zi = 2 * zr * zi + cim;
    zr = zr2 - zi2 + cre;
  }
  return -1;
}
