import {
  add, cfromNumbers, crebits, csub, ctoNumbers, fromDecimal, fromNumber, toDecimal, toNumber, type BigComplex,
} from './bigfloat';

export const MIN_ITER = 200;
export const MAX_ITER = 2 ** 22;
export const MIN_EXPONENT = -1;
export const DENSITY_MIN = 0.05;
export const DENSITY_MAX = 20;
export const SCALE_MIN = 1e-260;
export const SCALE_MAX = 1;

export interface ViewState {
  readonly centre: BigComplex;
  readonly scale: number; // complex units per CSS pixel
  readonly maxIter: number | 'auto';
  readonly palette: string;
  readonly density: number;
  readonly offset: number;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function precisionBits(scale: number): number {
  return Math.max(128, Math.ceil(-Math.log2(scale)) + 64);
}

export function zoomExponent(view: ViewState, widthCss: number): number {
  return Math.log10(4 / (view.scale * widthCss));
}

export function autoMaxIter(view: ViewState, widthCss: number): number {
  return clamp(Math.round(1000 + 400 * zoomExponent(view, widthCss)), MIN_ITER, MAX_ITER);
}

export function effectiveMaxIter(view: ViewState, widthCss: number): number {
  if (view.maxIter === 'auto') return autoMaxIter(view, widthCss);
  return clamp(Math.round(view.maxIter), MIN_ITER, MAX_ITER);
}

export function refLength(ceiling: number): number {
  let p = 2;
  while (p < ceiling) p *= 2;
  return Math.min(MAX_ITER, p);
}

/** The largest scale (most zoomed out) permitted: zoom exponent MIN_EXPONENT. */
export function maxScaleFor(widthCss: number): number {
  return 4 / (widthCss * 10 ** MIN_EXPONENT);
}

export function defaultView(widthCss: number): ViewState {
  const scale = 4 / widthCss;
  return {
    centre: cfromNumbers(-0.5, 0, precisionBits(scale)),
    scale,
    maxIter: 'auto',
    palette: 'classic',
    density: 1,
    offset: 0,
  };
}

/** Complex offset of the centre of CSS pixel (px, py) from the view centre. Screen y points down. */
export function pixelOffset(
  view: ViewState, px: number, py: number, widthCss: number, heightCss: number,
): { re: number; im: number } {
  return { re: (px - widthCss / 2) * view.scale, im: -(py - heightCss / 2) * view.scale };
}

function shiftCentre(centre: BigComplex, dre: number, dim: number, bits: number): BigComplex {
  const c = crebits(centre, bits);
  return { re: add(c.re, fromNumber(dre, bits)), im: add(c.im, fromNumber(dim, bits)) };
}

/** Zoom by `factor` (> 1 zooms in) keeping the complex point under (px, py) fixed. */
export function zoomAbout(
  view: ViewState, px: number, py: number, factor: number, widthCss: number, heightCss: number,
): ViewState {
  const target = clamp(view.scale / factor, SCALE_MIN, maxScaleFor(widthCss));
  if (target === view.scale) return view;
  const off = pixelOffset(view, px, py, widthCss, heightCss);
  const ratio = target / view.scale;
  const bits = precisionBits(target);
  return {
    ...view,
    scale: target,
    centre: shiftCentre(view.centre, off.re * (1 - ratio), off.im * (1 - ratio), bits),
  };
}

/** Pan so the content follows a drag of (dxPx, dyPx) CSS pixels. */
export function pan(view: ViewState, dxPx: number, dyPx: number): ViewState {
  if (dxPx === 0 && dyPx === 0) return view;
  return {
    ...view,
    centre: shiftCentre(view.centre, -dxPx * view.scale, dyPx * view.scale, view.centre.re.bits),
  };
}

/** view.centre − origin, as doubles. Exact in BigInt before the final conversion. */
export function offsetFrom(origin: BigComplex, view: ViewState): { re: number; im: number } {
  const bits = Math.max(origin.re.bits, view.centre.re.bits);
  return ctoNumbers(csub(crebits(view.centre, bits), crebits(origin, bits)));
}

export function halfDiagonal(view: ViewState, widthCss: number, heightCss: number): number {
  return 0.5 * Math.hypot(widthCss, heightCss) * view.scale;
}

/**
 * Geometry of a progressive pass with `stepCss` CSS pixels per pass pixel:
 * δ₀ of the centre of pass pixel (0, 0) relative to `refCentre`, and the complex size of a pass pixel.
 */
export function passGeometry(
  view: ViewState, refCentre: BigComplex, stepCss: number, widthCss: number, heightCss: number,
): { originRe: number; originIm: number; step: number } {
  const d = offsetFrom(refCentre, view);
  return {
    originRe: d.re + (0.5 * stepCss - widthCss / 2) * view.scale,
    originIm: d.im - (0.5 * stepCss - heightCss / 2) * view.scale,
    step: stepCss * view.scale,
  };
}

export function sameGeometry(a: ViewState, b: ViewState): boolean {
  return a.scale === b.scale && a.maxIter === b.maxIter
    && a.centre.re.bits === b.centre.re.bits
    && a.centre.re.m === b.centre.re.m && a.centre.im.m === b.centre.im.m;
}

const HASH_DECIMAL = /^-?\d+(\.\d+)?$/;
const HASH_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const HASH_PALETTE = /^[a-z0-9-]{1,32}$/;
const MAX_CENTRE_CHARS = 400;
const MAX_HASH_CHARS = 2000;
const MAX_CENTRE_ABS = 4;

export function toHash(view: ViewState): string {
  const p = new URLSearchParams();
  p.set('re', toDecimal(view.centre.re));
  p.set('im', toDecimal(view.centre.im));
  p.set('s', String(view.scale));
  p.set('i', view.maxIter === 'auto' ? 'auto' : String(view.maxIter));
  p.set('p', view.palette);
  p.set('d', String(view.density));
  p.set('o', String(view.offset));
  return '#' + p.toString();
}

/** Parses and validates a hash. Returns null when any field is missing, malformed or out of range. */
export function fromHash(hash: string): ViewState | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length === 0 || text.length > MAX_HASH_CHARS) return null;
  const p = new URLSearchParams(text);
  const re = p.get('re');
  const im = p.get('im');
  const s = p.get('s');
  const i = p.get('i');
  const pal = p.get('p');
  const d = p.get('d');
  const o = p.get('o');
  if (re === null || im === null || s === null || i === null || pal === null || d === null || o === null) {
    return null;
  }
  if (re.length > MAX_CENTRE_CHARS || im.length > MAX_CENTRE_CHARS) return null;
  if (!HASH_DECIMAL.test(re) || !HASH_DECIMAL.test(im)) return null;
  if (!HASH_NUMBER.test(s)) return null;
  const scale = Number(s);
  if (!Number.isFinite(scale) || scale < SCALE_MIN || scale > SCALE_MAX) return null;
  let maxIter: number | 'auto';
  if (i === 'auto') {
    maxIter = 'auto';
  } else {
    if (!HASH_NUMBER.test(i)) return null;
    const n = Number(i);
    if (!Number.isFinite(n)) return null;
    maxIter = clamp(Math.round(n), MIN_ITER, MAX_ITER);
  }
  if (!HASH_PALETTE.test(pal)) return null;
  if (!HASH_NUMBER.test(d) || !HASH_NUMBER.test(o)) return null;
  const density = Number(d);
  const offset = Number(o);
  if (!Number.isFinite(density) || !Number.isFinite(offset)) return null;
  const bits = precisionBits(scale);
  const centre: BigComplex = { re: fromDecimal(re, bits), im: fromDecimal(im, bits) };
  if (Math.abs(toNumber(centre.re)) > MAX_CENTRE_ABS || Math.abs(toNumber(centre.im)) > MAX_CENTRE_ABS) {
    return null;
  }
  return {
    centre,
    scale,
    maxIter,
    palette: pal,
    density: clamp(density, DENSITY_MIN, DENSITY_MAX),
    offset: offset - Math.floor(offset),
  };
}
