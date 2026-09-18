import type { BigComplex } from './bigfloat';
import type { SharedBlaMeta } from './bla';
import type { TileJob } from './perturb';
import type { SharedRefMeta } from './reference';
import {
  effectiveMaxIter, halfDiagonal, offsetFrom, passGeometry, precisionBits, refLength, type ViewState,
} from './viewport';

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  terminate(): void;
}

export type ToReferenceWorker =
  | { type: 'compute'; id: number; centre: BigComplex; length: number; bits: number; delta0Max: number }
  | { type: 'rebuildBla'; id: number; delta0Max: number };
export type FromReferenceWorker =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'done'; id: number; ref: SharedRefMeta; bla: SharedBlaMeta };
export type ToRenderWorker =
  | { type: 'setShared'; ref: SharedRefMeta; bla: SharedBlaMeta | null }
  | { type: 'tile'; job: TileJob };
export type FromRenderWorker = { type: 'tile'; job: TileJob; data: Float32Array };

export interface RenderTarget {
  widthCss: number;
  heightCss: number;
  dpr: number;
}

export interface PassResult {
  generation: number;
  pass: number;
  stepCss: number;
  width: number;
  height: number;
  values: Float32Array;
  elapsedMs: number;
  final: boolean;
}

export interface SchedulerEvents {
  onPass(result: PassResult): void;
  onReferenceStart(): void;
  onReferenceProgress(done: number, total: number): void;
  onReferenceDone(): void;
  onError(message: string): void;
}

export interface SchedulerOptions {
  poolSize: number;
  createRenderWorker(): WorkerLike;
  createReferenceWorker(): WorkerLike;
  now?: () => number;
}

export const TILE = 64;
export const PASS_STRIDES: readonly number[] = [8, 4, 2, 1];
export const REUSE_RADIUS = 4;
export const DELTA0_HEADROOM = 2;

function sameCentre(a: BigComplex | null, b: BigComplex): boolean {
  return a !== null && a.re.bits === b.re.bits && a.re.m === b.re.m && a.im.m === b.im.m;
}

function describeError(ev: unknown): string {
  if (ev !== null && typeof ev === 'object' && 'message' in ev && typeof (ev as { message: unknown }).message === 'string') {
    return (ev as { message: string }).message;
  }
  return String(ev);
}

interface PendingReference {
  id: number;
  kind: 'compute' | 'rebuild';
  centre: BigComplex;
  capacity: number;
  bits: number;
  delta0Max: number;
}

interface PassState {
  pass: number;
  stepCss: number;
  width: number;
  height: number;
  values: Float32Array;
  remaining: number;
}

interface Slot {
  worker: WorkerLike;
  busy: boolean;
  job: TileJob | null;
}

export class Scheduler {
  private generation = 0;
  private queue: TileJob[] = [];
  private readonly passes = new Map<number, PassState>();
  private passCount = 0;
  private nextPass = 0;
  private readonly completed = new Map<number, PassResult>();
  private readonly slots: Slot[] = [];
  private refWorker: WorkerLike;
  private ref: SharedRefMeta | null = null;
  private bla: SharedBlaMeta | null = null;
  private pending: PendingReference | null = null;
  /** Centre of the reference the current reference-worker instance holds, or will hold once its posted compute finishes. */
  private workerHolds: BigComplex | null = null;
  private nextId = 1;
  private renderErrors = 0;
  private view: ViewState | null = null;
  private target: RenderTarget | null = null;
  private startedAt = 0;
  private readonly now: () => number;

  constructor(
    private readonly options: SchedulerOptions,
    private readonly events: SchedulerEvents,
  ) {
    this.now = options.now ?? (() => performance.now());
    for (let i = 0; i < Math.max(1, options.poolSize); i++) this.slots.push(this.createSlot());
    this.refWorker = this.createReferenceWorker();
  }

  /** Renders `view`. Outstanding work for the previous view is abandoned. */
  render(view: ViewState, target: RenderTarget): void {
    this.generation++;
    this.queue = [];
    this.passes.clear();
    this.completed.clear();
    this.nextPass = 0;
    this.renderErrors = 0;
    this.view = view;
    this.target = target;
    this.startedAt = this.now();
    const need = refLength(effectiveMaxIter(view, target.widthCss));
    const bits = precisionBits(view.scale);
    const half = halfDiagonal(view, target.widthCss, target.heightCss);
    if (this.ref && this.reusable(this.ref.centre, this.ref.capacity, this.ref.bits, view, need, bits, half)) {
      const need0 = this.delta0Needed(this.ref.centre, view, half);
      if (this.bla && need0 <= this.bla.delta0Max) {
        this.cancelPending();
        this.startPasses();
        return;
      }
      if (
        this.pending?.kind === 'rebuild'
        && this.pending.delta0Max >= need0
        && sameCentre(this.pending.centre, this.ref.centre)
      ) {
        return;
      }
      if (sameCentre(this.workerHolds, this.ref.centre)) {
        this.requestRebuild(this.ref.centre, this.ref.capacity, this.ref.bits, DELTA0_HEADROOM * need0);
      } else {
        this.requestReference(view.centre, need, bits, DELTA0_HEADROOM * half);
      }
      return;
    }
    if (this.pending && this.reusable(this.pending.centre, this.pending.capacity, this.pending.bits, view, need, bits, half)) {
      const need0 = this.delta0Needed(this.pending.centre, view, half);
      if (this.pending.delta0Max >= need0) return;
      if (sameCentre(this.workerHolds, this.pending.centre)) {
        this.requestRebuild(this.pending.centre, this.pending.capacity, this.pending.bits, DELTA0_HEADROOM * need0);
      } else {
        this.requestReference(view.centre, need, bits, DELTA0_HEADROOM * half);
      }
      return;
    }
    this.requestReference(view.centre, need, bits, DELTA0_HEADROOM * half);
  }

  dispose(): void {
    for (const s of this.slots) s.worker.terminate();
    this.refWorker.terminate();
  }

  private wireSlot(slot: Slot): void {
    slot.worker.onmessage = (ev) => this.onRenderMessage(slot, ev.data as FromRenderWorker);
    slot.worker.onerror = (ev) => this.onRenderError(slot, ev);
  }

  private createSlot(): Slot {
    const slot: Slot = { worker: this.options.createRenderWorker(), busy: false, job: null };
    this.wireSlot(slot);
    return slot;
  }

  private onRenderError(slot: Slot, ev: unknown): void {
    const job = slot.job;
    slot.job = null;
    slot.busy = false;
    slot.worker.terminate();
    slot.worker = this.options.createRenderWorker();
    this.wireSlot(slot);
    if (this.ref) {
      const shared: ToRenderWorker = { type: 'setShared', ref: this.ref, bla: this.bla };
      slot.worker.postMessage(shared);
    }
    this.renderErrors++;
    if (job && job.generation === this.generation && this.renderErrors <= this.slots.length) {
      this.queue.unshift(job);
    } else {
      this.events.onError(`render worker failed: ${describeError(ev)}`);
    }
    this.dispatch();
  }

  private createReferenceWorker(): WorkerLike {
    const worker = this.options.createReferenceWorker();
    worker.onmessage = (ev) => this.onReferenceMessage(ev.data as FromReferenceWorker);
    worker.onerror = (ev) => this.onReferenceError(ev);
    this.workerHolds = null;
    return worker;
  }

  private onReferenceError(ev: unknown): void {
    const hadPending = this.pending !== null;
    this.pending = null;
    this.refWorker.terminate();
    this.refWorker = this.createReferenceWorker();
    if (hadPending) this.events.onReferenceDone();
    this.events.onError(`reference worker failed: ${describeError(ev)}`);
  }

  private reusable(
    centre: BigComplex, capacity: number, bits: number,
    view: ViewState, need: number, needBits: number, half: number,
  ): boolean {
    const d = offsetFrom(centre, view);
    return Math.hypot(d.re, d.im) <= REUSE_RADIUS * half && need <= capacity && bits >= needBits;
  }

  private delta0Needed(centre: BigComplex, view: ViewState, half: number): number {
    const d = offsetFrom(centre, view);
    return Math.hypot(d.re, d.im) + half;
  }

  /** Drops a pending request. An in-flight compute is terminated; a rebuild is simply ignored on arrival. */
  private cancelPending(): void {
    if (!this.pending) return;
    if (this.pending.kind === 'compute') {
      this.refWorker.terminate();
      this.refWorker = this.createReferenceWorker();
    }
    this.pending = null;
    this.events.onReferenceDone();
  }

  private requestReference(centre: BigComplex, length: number, bits: number, delta0Max: number): void {
    if (this.pending) {
      this.refWorker.terminate();
      this.refWorker = this.createReferenceWorker();
    }
    const id = this.nextId++;
    this.pending = { id, kind: 'compute', centre, capacity: length, bits, delta0Max };
    this.workerHolds = centre;
    this.events.onReferenceStart();
    const msg: ToReferenceWorker = { type: 'compute', id, centre, length, bits, delta0Max };
    this.refWorker.postMessage(msg);
  }

  /** Rebuilds the table for the reference the worker holds (or is computing), queued behind any compute. */
  private requestRebuild(centre: BigComplex, capacity: number, bits: number, delta0Max: number): void {
    const id = this.nextId++;
    this.pending = { id, kind: 'rebuild', centre, capacity, bits, delta0Max };
    this.events.onReferenceStart();
    const msg: ToReferenceWorker = { type: 'rebuildBla', id, delta0Max };
    this.refWorker.postMessage(msg);
  }

  private onReferenceMessage(msg: FromReferenceWorker): void {
    if (!this.pending || msg.id !== this.pending.id) return;
    if (msg.type === 'progress') {
      this.events.onReferenceProgress(msg.done, msg.total);
      return;
    }
    this.pending = null;
    this.ref = msg.ref;
    this.bla = msg.bla;
    this.events.onReferenceDone();
    const shared: ToRenderWorker = { type: 'setShared', ref: msg.ref, bla: msg.bla };
    for (const s of this.slots) s.worker.postMessage(shared);
    if (this.view && this.target) this.startPasses();
  }

  private startPasses(): void {
    const view = this.view;
    const target = this.target;
    const ref = this.ref;
    if (!view || !target || !ref) return;
    const maxIter = effectiveMaxIter(view, target.widthCss);
    const strides = [...PASS_STRIDES];
    if (target.dpr > 1) strides.push(1 / target.dpr);
    this.queue = [];
    this.passes.clear();
    this.completed.clear();
    this.nextPass = 0;
    this.passCount = strides.length;
    strides.forEach((stepCss, pass) => {
      const width = Math.ceil(target.widthCss / stepCss);
      const height = Math.ceil(target.heightCss / stepCss);
      const geo = passGeometry(view, ref.centre, stepCss, target.widthCss, target.heightCss);
      const state: PassState = { pass, stepCss, width, height, values: new Float32Array(width * height), remaining: 0 };
      for (let y = 0; y < height; y += TILE) {
        for (let x = 0; x < width; x += TILE) {
          this.queue.push({
            generation: this.generation, pass, x, y,
            w: Math.min(TILE, width - x), h: Math.min(TILE, height - y),
            originRe: geo.originRe, originIm: geo.originIm, step: geo.step, maxIter,
          });
          state.remaining++;
        }
      }
      this.passes.set(pass, state);
    });
    this.dispatch();
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.busy = true;
      slot.job = job;
      const msg: ToRenderWorker = { type: 'tile', job };
      slot.worker.postMessage(msg);
    }
  }

  private onRenderMessage(slot: Slot, msg: FromRenderWorker): void {
    slot.job = null;
    slot.busy = false;
    if (msg.type === 'tile' && msg.job.generation === this.generation) {
      const state = this.passes.get(msg.job.pass);
      if (state) {
        const { x, y, w, h } = msg.job;
        for (let row = 0; row < h; row++) {
          state.values.set(msg.data.subarray(row * w, row * w + w), (y + row) * state.width + x);
        }
        if (--state.remaining === 0) {
          this.passes.delete(msg.job.pass);
          this.completed.set(state.pass, {
            generation: this.generation, pass: state.pass, stepCss: state.stepCss,
            width: state.width, height: state.height, values: state.values,
            elapsedMs: this.now() - this.startedAt, final: state.pass === this.passCount - 1,
          });
          this.emitCompletedInOrder();
        }
      }
    }
    this.dispatch();
  }

  /** Emits completed passes strictly in stride order so a finer pass never precedes a coarser one. */
  private emitCompletedInOrder(): void {
    for (;;) {
      const next = this.completed.get(this.nextPass);
      if (!next) return;
      this.completed.delete(this.nextPass);
      this.nextPass++;
      this.events.onPass(next);
    }
  }
}
