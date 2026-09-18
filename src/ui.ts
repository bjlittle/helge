import { toNumber } from './bigfloat';
import type { Palette } from './palette';
import {
  DENSITY_MAX, DENSITY_MIN, effectiveMaxIter, MAX_ITER, MIN_ITER, zoomExponent, type ViewState,
} from './viewport';

export interface UiCallbacks {
  onPalette(id: string): void;
  onDensity(v: number): void;
  onOffset(v: number): void;
  onMaxIter(v: number | 'auto'): void;
  onReset(): void;
  onSave(): void;
  onHelp(): void;
}

export interface Ui {
  setView(view: ViewState, widthCss: number): void;
  setProgress(done: number, total: number): void;
  clearProgress(): void;
  setRenderTime(ms: number): void;
  toggleHelp(): void;
  closeHelp(): void;
}

const HELP: ReadonlyArray<readonly [string, string]> = [
  ['Scroll or Ctrl+scroll', 'Zoom about the cursor'],
  ['Drag', 'Pan'],
  ['Double-click', 'Zoom in ×2 at the point'],
  ['Arrow keys', 'Pan by a tenth of the view'],
  ['+ / −', 'Zoom in / out ×2'],
  ['R', 'Reset to the default view'],
  ['S', 'Save the current view as PNG'],
  ['?', 'Toggle this help'],
  ['Esc', 'Close this help'],
];

function formatCentre(view: ViewState): string {
  const re = toNumber(view.centre.re);
  const im = toNumber(view.centre.im);
  return `${re.toPrecision(12)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toPrecision(12)}i`;
}

export function createUi(root: HTMLElement, palettes: readonly Palette[], cb: UiCallbacks): Ui {
  root.innerHTML = `
    <div class="toolbar">
      <label>Palette
        <select id="palette">${palettes.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
      </label>
      <label>Density
        <input id="density" type="range" min="${Math.log10(DENSITY_MIN)}" max="${Math.log10(DENSITY_MAX)}" step="any">
      </label>
      <label>Offset
        <input id="offset" type="range" min="0" max="1" step="0.001">
      </label>
      <label><input id="auto" type="checkbox"> Auto iterations</label>
      <label>Iterations
        <input id="iters" type="range" min="${Math.log2(MIN_ITER)}" max="${Math.log2(MAX_ITER)}" step="any">
        <span id="iters-value"></span>
      </label>
      <div class="buttons">
        <button id="reset" type="button">Reset</button>
        <button id="save" type="button">Save PNG</button>
        <button id="help" type="button" aria-label="Help">?</button>
      </div>
    </div>
    <div class="readout">
      <span id="centre"></span> · zoom 10<sup id="zoom"></sup> · <span id="ceiling"></span> iterations · <span id="time"></span>
    </div>
    <div class="progress" id="progress" hidden><div id="progress-bar"></div></div>
    <div class="help" id="help-overlay" hidden>
      <h2>Mandelbrot viewer</h2>
      <table>${HELP.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
      <p>Press ? or Esc to close.</p>
    </div>`;

  const byId = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`ui element #${id} missing`);
    return el;
  };
  const palette = byId<HTMLSelectElement>('palette');
  const density = byId<HTMLInputElement>('density');
  const offset = byId<HTMLInputElement>('offset');
  const auto = byId<HTMLInputElement>('auto');
  const iters = byId<HTMLInputElement>('iters');
  const itersValue = byId<HTMLSpanElement>('iters-value');
  const centre = byId<HTMLSpanElement>('centre');
  const zoom = byId<HTMLElement>('zoom');
  const ceiling = byId<HTMLSpanElement>('ceiling');
  const time = byId<HTMLSpanElement>('time');
  const progress = byId<HTMLDivElement>('progress');
  const bar = byId<HTMLDivElement>('progress-bar');
  const helpOverlay = byId<HTMLDivElement>('help-overlay');

  palette.addEventListener('change', () => cb.onPalette(palette.value));
  density.addEventListener('input', () => cb.onDensity(10 ** Number(density.value)));
  offset.addEventListener('input', () => cb.onOffset(Number(offset.value)));
  auto.addEventListener('change', () => cb.onMaxIter(auto.checked ? 'auto' : Math.round(2 ** Number(iters.value))));
  iters.addEventListener('input', () => {
    auto.checked = false;
    cb.onMaxIter(Math.round(2 ** Number(iters.value)));
  });
  byId<HTMLButtonElement>('reset').addEventListener('click', () => cb.onReset());
  byId<HTMLButtonElement>('save').addEventListener('click', () => cb.onSave());
  byId<HTMLButtonElement>('help').addEventListener('click', () => cb.onHelp());

  return {
    setView(view, widthCss) {
      palette.value = view.palette;
      density.value = String(Math.log10(view.density));
      offset.value = String(view.offset);
      const max = effectiveMaxIter(view, widthCss);
      auto.checked = view.maxIter === 'auto';
      iters.value = String(Math.log2(max));
      itersValue.textContent = max.toLocaleString();
      centre.textContent = formatCentre(view);
      zoom.textContent = zoomExponent(view, widthCss).toFixed(2);
      ceiling.textContent = max.toLocaleString();
    },
    setProgress(done, total) {
      progress.hidden = false;
      bar.style.width = `${total > 0 ? (100 * done) / total : 0}%`;
    },
    clearProgress() {
      progress.hidden = true;
      bar.style.width = '0%';
    },
    setRenderTime(ms) {
      time.textContent = ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
    },
    toggleHelp() {
      helpOverlay.hidden = !helpOverlay.hidden;
    },
    closeHelp() {
      helpOverlay.hidden = true;
    },
  };
}
