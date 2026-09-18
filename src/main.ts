import './styles.css';
import { CanvasView } from './canvas';
import { createHistory } from './history';
import { attachInput, GESTURE_END_MS } from './input';
import { colourise, paletteById } from './palette';
import { Scheduler, type PassResult, type RenderTarget, type WorkerLike } from './scheduler';
import {
  defaultView, fromHash, pan, sameGeometry, toHash, zoomAbout, type ViewState,
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
  return fromHash(hash) ?? defaultView(target().widthCss);
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
    },
    onReferenceStart() {},
    onReferenceProgress() {},
    onReferenceDone() {},
  },
);

function repaint(): void {
  if (!latest) return;
  const rgba = new Uint8ClampedArray(latest.width * latest.height * 4);
  colourise(latest.values, paletteById(renderedView.palette), renderedView.density, renderedView.offset, rgba);
  canvasView.paint(rgba, latest.width, latest.height, latest.stepCss, renderedView, !latest.final);
}

function render(): void {
  const t = target();
  canvasView.resize(t.widthCss, t.heightCss, t.dpr);
  canvasView.transformTo(view);
  renderedView = view;
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
  save: () => {},
  toggleHelp: () => {},
  closeHelp: () => {},
  gestureEnd: endGesture,
});

window.addEventListener('resize', render);
history.write(toHash(view), 'replace');
render();
