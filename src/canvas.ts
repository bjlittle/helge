import { offsetFrom, type ViewState } from './viewport';

/** Owns the visible canvas: paints completed passes and transforms the last bitmap during gestures. */
export class CanvasView {
  private readonly ctx: CanvasRenderingContext2D;
  private last: HTMLCanvasElement | null = null;
  private lastStepCss = 1;
  private lastView: ViewState | null = null;
  private widthCss = 0;
  private heightCss = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas context unavailable');
    this.ctx = ctx;
  }

  resize(widthCss: number, heightCss: number, dpr: number): void {
    const w = Math.round(widthCss * dpr);
    const h = Math.round(heightCss * dpr);
    this.widthCss = widthCss;
    this.heightCss = heightCss;
    this.dpr = dpr;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.width = `${widthCss}px`;
    this.canvas.style.height = `${heightCss}px`;
  }

  /** Paints a completed pass (`rgba` is width × height × 4) covering the viewport at `stepCss` CSS px per pass px. */
  paint(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, stepCss: number, view: ViewState, smooth: boolean): void {
    if (!this.last || this.last.width !== width || this.last.height !== height) {
      this.last = document.createElement('canvas');
      this.last.width = width;
      this.last.height = height;
    }
    const lctx = this.last.getContext('2d');
    if (!lctx) throw new Error('2d canvas context unavailable');
    lctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    this.lastStepCss = stepCss;
    this.lastView = view;
    this.clear();
    this.ctx.imageSmoothingEnabled = smooth;
    this.ctx.drawImage(this.last, 0, 0, width * stepCss, height * stepCss);
  }

  /** Redraws the last painted bitmap translated and scaled to where it belongs in `view`. */
  transformTo(view: ViewState): void {
    if (!this.last || !this.lastView) return;
    this.clear();
    const ratio = this.lastView.scale / view.scale;
    const d = offsetFrom(view.centre, this.lastView); // last centre − new centre
    const cx = this.widthCss / 2 + d.re / view.scale;
    const cy = this.heightCss / 2 - d.im / view.scale;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(
      this.last,
      cx - (this.widthCss / 2) * ratio,
      cy - (this.heightCss / 2) * ratio,
      this.last.width * this.lastStepCss * ratio,
      this.last.height * this.lastStepCss * ratio,
    );
  }

  toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
    });
  }

  private clear(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.widthCss, this.heightCss);
  }
}
