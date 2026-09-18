export const LUT_SIZE = 4096;

export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly stops: ReadonlyArray<readonly [t: number, r: number, g: number, b: number]>;
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'classic',
    name: 'Classic',
    stops: [[0, 0, 7, 100], [0.16, 32, 107, 203], [0.42, 237, 255, 255], [0.6425, 255, 170, 0], [0.8575, 0, 2, 0], [1, 0, 7, 100]],
  },
  {
    id: 'fire',
    name: 'Fire',
    stops: [[0, 0, 0, 0], [0.25, 120, 0, 0], [0.5, 255, 80, 0], [0.75, 255, 220, 80], [1, 0, 0, 0]],
  },
  {
    id: 'ice',
    name: 'Ice',
    stops: [[0, 0, 0, 30], [0.3, 0, 60, 160], [0.6, 120, 200, 255], [0.85, 240, 250, 255], [1, 0, 0, 30]],
  },
  {
    id: 'gray',
    name: 'Grayscale',
    stops: [[0, 0, 0, 0], [0.5, 255, 255, 255], [1, 0, 0, 0]],
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    stops: [[0, 255, 0, 0], [1 / 6, 255, 255, 0], [2 / 6, 0, 255, 0], [3 / 6, 0, 255, 255], [4 / 6, 0, 0, 255], [5 / 6, 255, 0, 255], [1, 255, 0, 0]],
  },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Expands the stops to a LUT_SIZE × RGB table by linear interpolation. */
export function buildLut(p: Palette): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 3);
  const stops = p.stops;
  let k = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / LUT_SIZE;
    while (k < stops.length - 2 && t >= stops[k + 1][0]) k++;
    const [t0, r0, g0, b0] = stops[k];
    const [t1, r1, g1, b1] = stops[k + 1];
    const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    lut[3 * i] = r0 + (r1 - r0) * u;
    lut[3 * i + 1] = g0 + (g1 - g0) * u;
    lut[3 * i + 2] = b0 + (b1 - b0) * u;
  }
  return lut;
}

const lutCache = new Map<string, Uint8ClampedArray>();

function lutFor(p: Palette): Uint8ClampedArray {
  let lut = lutCache.get(p.id);
  if (!lut) {
    lut = buildLut(p);
    lutCache.set(p.id, lut);
  }
  return lut;
}

/** Maps smooth iteration values to RGBA. Interior (v < 0) is opaque black. */
export function colourise(
  values: Float32Array,
  palette: Palette,
  density: number,
  offset: number,
  out: Uint8ClampedArray,
): void {
  const lut = lutFor(palette);
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const o = 4 * i;
    if (v < 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 255;
      continue;
    }
    let t = density * Math.log2(1 + v) + offset;
    t -= Math.floor(t);
    let idx = (t * LUT_SIZE) | 0;
    if (idx >= LUT_SIZE) idx = LUT_SIZE - 1;
    if (idx < 0) idx = 0;
    out[o] = lut[3 * idx];
    out[o + 1] = lut[3 * idx + 1];
    out[o + 2] = lut[3 * idx + 2];
    out[o + 3] = 255;
  }
}
