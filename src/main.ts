import './styles.css';
import { CanvasView } from './canvas';
import { colourise, paletteById } from './palette';
import { Scheduler, type PassResult, type RenderTarget, type WorkerLike } from './scheduler';
import { defaultView, fromHash, type ViewState } from './viewport';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const canvasView = new CanvasView(canvas);

function target(): RenderTarget {
  return { widthCss: window.innerWidth, heightCss: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}

// A real Worker's `onmessage` accepts a full MessageEvent, which is structurally wider than
// WorkerLike's `{ data: unknown }`; the cast is compile-time only and has no runtime effect.
function asWorkerLike(worker: Worker): WorkerLike {
  return worker as unknown as WorkerLike;
}

const view: ViewState = fromHash(location.hash) ?? defaultView(target().widthCss);
let renderedView: ViewState = view;
let latest: PassResult | null = null;

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

window.addEventListener('resize', render);
render();
