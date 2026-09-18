/** Fixed-point real number: value = m / 2^bits. All operands of a binary op share `bits`. */
export interface Fixed {
  readonly m: bigint;
  readonly bits: number;
}

export interface BigComplex {
  readonly re: Fixed;
  readonly im: Fixed;
}

export function zero(bits: number): Fixed {
  return { m: 0n, bits };
}

export function czero(bits: number): BigComplex {
  return { re: zero(bits), im: zero(bits) };
}

export function bitLength(m: bigint): number {
  if (m < 0n) m = -m;
  return m === 0n ? 0 : m.toString(2).length;
}

function sameBits(a: Fixed, b: Fixed): void {
  if (a.bits !== b.bits) throw new RangeError(`precision mismatch: ${a.bits} vs ${b.bits}`);
}

/** Exact conversion of a finite double: decomposes the IEEE mantissa and exponent. */
export function fromNumber(x: number, bits: number): Fixed {
  if (!Number.isFinite(x)) throw new RangeError(`fromNumber: ${x}`);
  if (x === 0) return { m: 0n, bits };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp: number;
  if (biased === 0) {
    exp = -1074;
  } else {
    mant |= 1n << 52n;
    exp = biased - 1075;
  }
  const shift = exp + bits;
  const m = shift >= 0 ? mant << BigInt(shift) : mant >> BigInt(-shift);
  return { m: negative ? -m : m, bits };
}

/** 2^e without intermediate overflow or underflow for |e| up to about 2000. */
function pow2(e: number): number {
  const h = Math.trunc(e / 2);
  return 2 ** h * 2 ** (e - h);
}

export function toNumber(x: Fixed): number {
  if (x.m === 0n) return 0;
  const negative = x.m < 0n;
  let m = negative ? -x.m : x.m;
  const drop = Math.max(0, bitLength(m) - 64);
  if (drop > 0) m >>= BigInt(drop);
  const v = Number(m) * pow2(drop - x.bits);
  return negative ? -v : v;
}

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** Parses a plain decimal string ("-0.5", "2", ".25") to the nearest fixed-point value. */
export function fromDecimal(s: string, bits: number): Fixed {
  const match = DECIMAL.exec(s.trim());
  if (!match) throw new SyntaxError(`fromDecimal: ${JSON.stringify(s)}`);
  const sign = match[1];
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? '';
  if (intPart === '' && fracPart === '') throw new SyntaxError(`fromDecimal: ${JSON.stringify(s)}`);
  const digits = BigInt((intPart || '0') + fracPart);
  const scale = 10n ** BigInt(fracPart.length);
  const q = ((digits << BigInt(bits)) + scale / 2n) / scale;
  return { m: sign === '-' ? -q : q, bits };
}

/** Formats with enough digits that fromDecimal(toDecimal(x), x.bits) is exact. */
export function toDecimal(x: Fixed): string {
  const digits = Math.ceil(x.bits * Math.log10(2)) + 1;
  const negative = x.m < 0n;
  const m = negative ? -x.m : x.m;
  const half = x.bits > 0 ? 1n << BigInt(x.bits - 1) : 0n;
  const scaled = (m * 10n ** BigInt(digits) + half) >> BigInt(x.bits);
  const text = scaled.toString().padStart(digits + 1, '0');
  const intPart = text.slice(0, text.length - digits);
  const fracPart = text.slice(text.length - digits).replace(/0+$/, '');
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative && scaled !== 0n ? `-${body}` : body;
}

export function add(a: Fixed, b: Fixed): Fixed {
  sameBits(a, b);
  return { m: a.m + b.m, bits: a.bits };
}

export function sub(a: Fixed, b: Fixed): Fixed {
  sameBits(a, b);
  return { m: a.m - b.m, bits: a.bits };
}

export function mul(a: Fixed, b: Fixed): Fixed {
  sameBits(a, b);
  return { m: (a.m * b.m) >> BigInt(a.bits), bits: a.bits };
}

export function sqr(a: Fixed): Fixed {
  return { m: (a.m * a.m) >> BigInt(a.bits), bits: a.bits };
}

export function neg(a: Fixed): Fixed {
  return { m: -a.m, bits: a.bits };
}

export function shl1(a: Fixed): Fixed {
  return { m: a.m << 1n, bits: a.bits };
}

export function cmpAbs(a: Fixed, b: Fixed): -1 | 0 | 1 {
  sameBits(a, b);
  const x = a.m < 0n ? -a.m : a.m;
  const y = b.m < 0n ? -b.m : b.m;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function rebits(x: Fixed, bits: number): Fixed {
  if (bits === x.bits) return x;
  const d = bits - x.bits;
  return { m: d > 0 ? x.m << BigInt(d) : x.m >> BigInt(-d), bits };
}

export function crebits(a: BigComplex, bits: number): BigComplex {
  return { re: rebits(a.re, bits), im: rebits(a.im, bits) };
}

export function cadd(a: BigComplex, b: BigComplex): BigComplex {
  return { re: add(a.re, b.re), im: add(a.im, b.im) };
}

export function csub(a: BigComplex, b: BigComplex): BigComplex {
  return { re: sub(a.re, b.re), im: sub(a.im, b.im) };
}

export function cmul(a: BigComplex, b: BigComplex): BigComplex {
  return {
    re: sub(mul(a.re, b.re), mul(a.im, b.im)),
    im: add(mul(a.re, b.im), mul(a.im, b.re)),
  };
}

export function csqr(a: BigComplex): BigComplex {
  return { re: sub(sqr(a.re), sqr(a.im)), im: shl1(mul(a.re, a.im)) };
}

export function cnorm2(a: BigComplex): number {
  const r = toNumber(a.re);
  const i = toNumber(a.im);
  return r * r + i * i;
}

export function cfromNumbers(re: number, im: number, bits: number): BigComplex {
  return { re: fromNumber(re, bits), im: fromNumber(im, bits) };
}

export function ctoNumbers(a: BigComplex): { re: number; im: number } {
  return { re: toNumber(a.re), im: toNumber(a.im) };
}
