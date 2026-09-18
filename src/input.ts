export const WHEEL_BASE = 1.1;
export const WHEEL_MIN = 0.25;
export const WHEEL_MAX = 4;
export const GESTURE_END_MS = 150;

export interface InputActions {
  zoomAt(px: number, py: number, factor: number): void;
  panBy(dx: number, dy: number): void;
  reset(): void;
  save(): void;
  toggleHelp(): void;
  closeHelp(): void;
  gestureEnd(): void;
}

/** Zoom factor for one wheel event. Negative deltaY (scroll up) zooms in. */
export function wheelFactor(deltaY: number, deltaMode: number, viewportHeight: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * viewportHeight : deltaY;
  return Math.min(WHEEL_MAX, Math.max(WHEEL_MIN, WHEEL_BASE ** (-px / 100)));
}

function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';
}

/** Wires wheel, pointer, double-click and keyboard input on `el` to `actions`. Returns a detach function. */
export function attachInput(el: HTMLElement, actions: InputActions): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const local = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    actions.zoomAt(p.x, p.y, wheelFactor(e.deltaY, e.deltaMode, p.h));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    actions.panBy(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    actions.gestureEnd();
  };
  const onDoubleClick = (e: MouseEvent) => {
    const p = local(e);
    actions.zoomAt(p.x, p.y, 2);
    actions.gestureEnd();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isFormField(e.target)) return;
    const r = el.getBoundingClientRect();
    const stepX = r.width / 10;
    const stepY = r.height / 10;
    switch (e.key) {
      case 'ArrowLeft': actions.panBy(stepX, 0); break;
      case 'ArrowRight': actions.panBy(-stepX, 0); break;
      case 'ArrowUp': actions.panBy(0, stepY); break;
      case 'ArrowDown': actions.panBy(0, -stepY); break;
      case '+': case '=': actions.zoomAt(r.width / 2, r.height / 2, 2); break;
      case '-': case '_': actions.zoomAt(r.width / 2, r.height / 2, 0.5); break;
      case 'r': case 'R': actions.reset(); break;
      case 's': case 'S': actions.save(); return;
      case '?': actions.toggleHelp(); return;
      case 'Escape': actions.closeHelp(); return;
      default: return;
    }
    e.preventDefault();
    actions.gestureEnd();
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('keydown', onKeyDown);
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.removeEventListener('dblclick', onDoubleClick);
    window.removeEventListener('keydown', onKeyDown);
  };
}
