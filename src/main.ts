import './styles.css';
import { toDecimal } from './bigfloat';
import { CanvasView } from './canvas';
import { downloadName } from './filename';
import { createHistory } from './history';
import { attachInput, GESTURE_END_MS } from './input';
import { colourise, paletteById, PALETTES } from './palette';
import { Scheduler, type PassResult, type RenderTarget, type WorkerLike } from './scheduler';
import { createUi } from './ui';
import {
  defaultView, fromHash, maxScaleFor, pan, sameGeometry, toHash, zoomAbout, zoomExponent, type ViewState,
} from './viewport';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const canvasView = new CanvasView(canvas);

function target(): RenderTarget {
  return { widthCss: window.innerWidth, heightCss: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}

/** A DOM Worker satisfies WorkerLike at runtime; the cast bridges strictFunctionTypes on onmessage. */
function asWorkerLike(worker: Worker): WorkerLike {
  return worker as unknown as WorkerLike;
}

function viewFromHash(hash: string): ViewState {
  const widthCss = target().widthCss;
  const parsed = fromHash(hash) ?? defaultView(widthCss);
  const withPalette = PALETTES.some((p) => p.id === parsed.palette) ? parsed : { ...parsed, palette: 'classic' };
  const maxScale = maxScaleFor(widthCss);
  return withPalette.scale > maxScale ? { ...withPalette, scale: maxScale } : withPalette;
}

let view: ViewState = viewFromHash(location.hash);
let renderedView: ViewState = view;
let latest: PassResult | null = null;
let inGesture = false;
let gestureTimer: number | undefined;

const history = createHistory((hash) => {
  view = viewFromHash(hash);
  render();
});

const ui = createUi(document.getElementById('ui') as HTMLElement, PALETTES, {
  onPalette: (id) => setView({ ...view, palette: id }),
  onDensity: (d) => setView({ ...view, density: d }),
  onOffset: (o) => setView({ ...view, offset: o }),
  onMaxIter: (m) => setView({ ...view, maxIter: m }),
  onReset: () => setView(defaultView(target().widthCss)),
  onSave: () => { save().catch(reportSaveFailure); },
  onHelp: () => ui.toggleHelp(),
});

if (!crossOriginIsolated) {
  ui.setStatus('This page needs cross-origin isolation. Serve it with npm run dev or npm run preview.');
  throw new Error('crossOriginIsolated is false');
}

function reportSaveFailure(err: unknown): void {
  ui.setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
}

async function save(): Promise<void> {
  const blob = await canvasView.toBlob();
  const name = downloadName(zoomExponent(view, target().widthCss), toDecimal(view.centre.re), toDecimal(view.centre.im));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const scheduler = new Scheduler(
  {
    poolSize: Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
    createRenderWorker: () => asWorkerLike(new Worker(new URL('./render-worker.ts', import.meta.url), { type: 'module' })),
    createReferenceWorker: () => asWorkerLike(new Worker(new URL('./reference-worker.ts', import.meta.url), { type: 'module' })),
  },
  {
    onPass(result) {
      latest = result;
      repaint();
      if (result.final) ui.setRenderTime(result.elapsedMs);
    },
    onReferenceStart() { ui.setProgress(0, 1); },
    onReferenceProgress(done, total) { ui.setProgress(done, total); },
    onReferenceDone() { ui.clearProgress(); },
    onError(message) { ui.setStatus(message); },
  },
);

let rgbaBuffer: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(0);

function repaint(): void {
  if (!latest) return;
  const size = latest.width * latest.height * 4;
  if (rgbaBuffer.length !== size) rgbaBuffer = new Uint8ClampedArray(size);
  colourise(latest.values, paletteById(renderedView.palette), renderedView.density, renderedView.offset, rgbaBuffer);
  canvasView.paint(rgbaBuffer, latest.width, latest.height, latest.stepCss, renderedView, !latest.final);
}

function render(): void {
  const t = target();
  canvasView.resize(t.widthCss, t.heightCss, t.dpr);
  canvasView.transformTo(view);
  renderedView = view;
  ui.setView(view, t.widthCss);
  scheduler.render(view, t);
}

function endGesture(): void {
  inGesture = false;
  if (gestureTimer !== undefined) {
    window.clearTimeout(gestureTimer);
    gestureTimer = undefined;
  }
}

/** Applies a user-driven view change: history, interim transform, then recompute or recolour. */
function setView(next: ViewState): void {
  if (next === view) return;
  const geometryChanged = !sameGeometry(next, view);
  view = next;
  ui.setView(view, target().widthCss);
  history.write(toHash(view), inGesture ? 'replace' : 'push');
  inGesture = true;
  if (gestureTimer !== undefined) window.clearTimeout(gestureTimer);
  gestureTimer = window.setTimeout(endGesture, GESTURE_END_MS);
  if (geometryChanged) {
    render();
  } else {
    renderedView = view;
    repaint();
  }
}

attachInput(canvas, {
  zoomAt: (px, py, factor) => setView(zoomAbout(view, px, py, factor, target().widthCss, target().heightCss)),
  panBy: (dx, dy) => setView(pan(view, dx, dy)),
  reset: () => setView(defaultView(target().widthCss)),
  save: () => { save().catch(reportSaveFailure); },
  toggleHelp: () => ui.toggleHelp(),
  closeHelp: () => ui.closeHelp(),
  gestureEnd: endGesture,
});

window.addEventListener('resize', render);
history.write(toHash(view), 'replace');
render();
