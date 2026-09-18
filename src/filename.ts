/** FNV-1a 32-bit hash as 8 lowercase hex digits. */
export function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Short, filesystem-safe PNG name: the zoom exponent plus a hash of the centre. */
export function downloadName(exponent: number, centreRe: string, centreIm: string): string {
  return `mandelbrot-e${exponent.toFixed(1)}-${hash8(`${centreRe},${centreIm}`)}.png`;
}
