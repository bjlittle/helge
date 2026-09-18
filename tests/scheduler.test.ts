import { describe, expect, it } from 'vitest';
import type { SharedBlaMeta } from '../src/bla';
import type { SharedRefMeta } from '../src/reference';
import {
  DELTA0_HEADROOM, Scheduler, type FromRenderWorker, type PassResult, type ToReferenceWorker,
  type ToRenderWorker, type WorkerLike,
} from '../src/scheduler';
import { defaultView, halfDiagonal, pan, zoomAbout } from '../src/viewport';

class FakeWorker implements WorkerLike {
  posted: unknown[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  terminated = false;
  answered = 0;
  postMessage(message: unknown): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }
  receive(data: unknown): void { this.onmessage?.({ data }); }
  tiles(): ToRenderWorker[] {
    return (this.posted as ToRenderWorker[]).filter((m) => m.type === 'tile');
  }
  computes(): Extract<ToReferenceWorker, { type: 'compute' }>[] {
    return (this.posted as ToReferenceWorker[]).filter(
      (m): m is Extract<ToReferenceWorker, { type: 'compute' }> => m.type === 'compute',
    );
  }
  outstanding(): number { return this.tiles().length - this.answered; }
  /** Answers the oldest unanswered tile with a buffer filled with `value`. */
  answerOne(value = 1): void {
    const msg = this.tiles()[this.answered];
    if (!msg || msg.type !== 'tile') throw new Error('no outstanding tile');
    this.answered++;
    const data = new Float32Array(msg.job.w * msg.job.h).fill(value);
    const reply: FromRenderWorker = { type: 'tile', job: msg.job, data };
    this.receive(reply);
  }
}

function fakeDone(msg: ToReferenceWorker, previous?: { ref: SharedRefMeta }): { ref: SharedRefMeta; bla: SharedBlaMeta } {
  if (msg.type === 'compute') {
    const ref: SharedRefMeta = {
      buffer: new SharedArrayBuffer(16 * msg.length), length: msg.length, capacity: msg.length,
      escaped: false, centre: msg.centre, bits: msg.bits,
    };
    return { ref, bla: { buffer: new SharedArrayBuffer(40), levels: 1, length: msg.length, delta0Max: msg.delta0Max } };
  }
  if (!previous) throw new Error('rebuild without a previous reference');
  return { ref: previous.ref, bla: { buffer: new SharedArrayBuffer(40), levels: 1, length: previous.ref.length, delta0Max: msg.delta0Max } };
}

const W = 128;
const H = 64;
const target = { widthCss: W, heightCss: H, dpr: 1 };

function setup(poolSize = 2) {
  const renders: FakeWorker[] = [];
  const refs: FakeWorker[] = [];
  const passes: PassResult[] = [];
  const progress: [number, number][] = [];
  const counts = { starts: 0, dones: 0 };
  const scheduler = new Scheduler(
    {
      poolSize,
      createRenderWorker: () => { const w = new FakeWorker(); renders.push(w); return w; },
      createReferenceWorker: () => { const w = new FakeWorker(); refs.push(w); return w; },
      now: () => 0,
    },
    {
      onPass: (r) => passes.push(r),
      onReferenceStart: () => { counts.starts++; },
      onReferenceProgress: (d, t) => progress.push([d, t]),
      onReferenceDone: () => { counts.dones++; },
    },
  );
  let lastDone: { ref: SharedRefMeta } | undefined;
  const completeReference = () => {
    const w = refs[refs.length - 1];
    const msg = w.posted[w.posted.length - 1] as ToReferenceWorker;
    const done = fakeDone(msg, lastDone);
    lastDone = done;
    w.receive({ type: 'done', id: msg.id, ...done });
  };
  const drain = () => {
    for (let guard = 0; guard < 1000; guard++) {
      const w = renders.find((r) => r.outstanding() > 0);
      if (!w) return;
      w.answerOne();
    }
    throw new Error('drain did not settle');
  };
  return { scheduler, renders, refs, passes, progress, counts, completeReference, drain };
}

describe('Scheduler', () => {
  it('requests a reference before posting any tile', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    expect(s.refs).toHaveLength(1);
    const msg = s.refs[0].computes()[0];
    expect(msg.length).toBe(1024);
    expect(msg.bits).toBe(128);
    expect(msg.delta0Max).toBeCloseTo(DELTA0_HEADROOM * halfDiagonal(defaultView(W), W, H), 15);
    expect(s.renders.every((r) => r.posted.length === 0)).toBe(true);
    expect(s.counts.starts).toBe(1);
  });

  it('shares the reference and posts exactly one tile per worker', () => {
    const s = setup(3);
    s.scheduler.render(defaultView(W), target);
    s.completeReference();
    expect(s.counts.dones).toBe(1);
    for (const r of s.renders) {
      expect((r.posted[0] as ToRenderWorker).type).toBe('setShared');
      expect(r.tiles()).toHaveLength(1);
    }
  });

  it('assembles passes in stride order and flags the last as final', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    s.completeReference();
    s.drain();
    expect(s.passes.map((p) => [p.pass, p.stepCss, p.width, p.height, p.final])).toEqual([
      [0, 8, 16, 8, false], [1, 4, 32, 16, false], [2, 2, 64, 32, false], [3, 1, 128, 64, true],
    ]);
    expect(s.passes[3].values.every((v) => v === 1)).toBe(true);
    expect(s.passes[3].values.length).toBe(128 * 64);
  });

  it('adds a device-pixel-ratio pass when dpr > 1', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), { ...target, dpr: 2 });
    s.completeReference();
    s.drain();
    expect(s.passes).toHaveLength(5);
    expect(s.passes[4]).toMatchObject({ stepCss: 0.5, width: 256, height: 128, final: true });
  });

  it('drops stale tiles and clears the queue on a view change', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 1, 0), target);
    for (const r of s.renders) r.answerOne(7);
    expect(s.passes).toHaveLength(0);
    for (const r of s.renders) {
      const latest = r.tiles()[r.tiles().length - 1];
      expect(latest.type === 'tile' && latest.job.generation).toBe(2);
    }
    s.drain();
    expect(s.passes.every((p) => p.generation === 2)).toBe(true);
    expect(s.passes).toHaveLength(4);
    expect(s.passes[3].values.every((v) => v === 1)).toBe(true);
  });

  it('reuses a nearby reference without a new request', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 10, 5), target);
    expect(s.refs[0].computes()).toHaveLength(1);
    expect(s.counts.starts).toBe(1);
  });

  it('requests a new reference when the needed length exceeds the capacity', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(zoomAbout(view, 64, 32, 1e12, W, H), target);
    expect(s.refs[0].computes()).toHaveLength(2);
    expect(s.refs[0].computes()[1].length).toBe(8192);
    expect(s.counts.starts).toBe(2);
  });

  it('requests a new reference when the centre moves far away', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 10000, 0), target);
    expect(s.refs[0].computes()).toHaveLength(2);
  });

  it('terminates an in-flight reference worker when superseded', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    const first = s.refs[0].computes()[0];
    s.scheduler.render(zoomAbout(view, 64, 32, 1e12, W, H), target);
    expect(s.refs[0].terminated).toBe(true);
    expect(s.refs).toHaveLength(2);
    s.refs[0].receive({ type: 'done', id: first.id, ...fakeDone(first) });
    expect(s.counts.dones).toBe(0);
    s.completeReference();
    expect(s.counts.dones).toBe(1);
    expect(s.renders.every((r) => r.tiles().length === 1)).toBe(true);
  });

  it('waits for a compatible in-flight reference', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.scheduler.render(pan(view, 3, 3), target);
    expect(s.refs).toHaveLength(1);
    expect(s.refs[0].computes()).toHaveLength(1);
    s.completeReference();
    for (const r of s.renders) {
      const t = r.tiles()[0];
      expect(t.type === 'tile' && t.job.generation).toBe(2);
    }
  });

  it('cancels an outstanding reference request when the held reference is reusable again', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(pan(view, 10000, 0), target);
    const abandoned = s.refs[0].computes()[1];
    s.scheduler.render(view, target);
    expect(s.refs[0].terminated).toBe(true);
    expect(s.refs).toHaveLength(2);
    s.refs[0].receive({ type: 'done', id: abandoned.id, ...fakeDone(abandoned) });
    expect(s.counts.dones).toBe(1);
    s.drain();
    expect(s.passes.map((p) => p.generation)).toEqual([3, 3, 3, 3]);
    expect(s.passes[3].values.every((v) => v === 1)).toBe(true);
    const gen3Tiles = s.renders.flatMap((r) => r.tiles()).filter((t) => t.type === 'tile' && t.job.generation === 3);
    expect(gen3Tiles).toHaveLength(5);
  });

  it('shares the BLA table alongside the reference', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    s.completeReference();
    const shared = s.renders[0].posted[0] as ToRenderWorker;
    expect(shared.type === 'setShared' && shared.bla !== null).toBe(true);
  });

  it('rebuilds the table when zooming out past its bound and waits for it', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    const tilesBefore = s.renders.map((r) => r.tiles().length);
    s.scheduler.render(zoomAbout(view, 64, 32, 1 / 3, W, H), target);
    const last = s.refs[0].posted[s.refs[0].posted.length - 1] as ToReferenceWorker;
    expect(last.type).toBe('rebuildBla');
    expect(last.type === 'rebuildBla' && last.delta0Max).toBeCloseTo(DELTA0_HEADROOM * 3 * halfDiagonal(view, W, H), 12);
    expect(s.renders.map((r) => r.tiles().length)).toEqual(tilesBefore);
    for (const r of s.renders) r.answerOne();
    expect(s.renders.map((r) => r.tiles().length)).toEqual(tilesBefore);
    s.completeReference();
    for (const r of s.renders) {
      const t = r.tiles()[r.tiles().length - 1];
      expect(t.type === 'tile' && t.job.generation).toBe(2);
    }
  });

  it('a small zoom in reuses reference and table with no worker messages', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    const posted = s.refs[0].posted.length;
    s.scheduler.render(zoomAbout(view, 64, 32, 1.05, W, H), target);
    expect(s.refs[0].posted.length).toBe(posted);
  });

  it('cancels a pending rebuild when a later view no longer needs it', () => {
    const s = setup();
    const view = defaultView(W);
    s.scheduler.render(view, target);
    s.completeReference();
    s.scheduler.render(zoomAbout(view, 64, 32, 1 / 3, W, H), target);
    const rebuild = s.refs[0].posted[s.refs[0].posted.length - 1] as ToReferenceWorker;
    s.scheduler.render(view, target);
    const donesBefore = s.counts.dones;
    s.refs[0].receive({ type: 'done', id: rebuild.id, ...fakeDone(rebuild, { ref: fakeDone(s.refs[0].computes()[0]).ref }) });
    expect(s.counts.dones).toBe(donesBefore);
    expect(s.refs[0].terminated).toBe(false);
  });

  it('forwards progress for the current id and ignores stale ids', () => {
    const s = setup();
    s.scheduler.render(defaultView(W), target);
    const id = s.refs[0].computes()[0].id;
    s.refs[0].receive({ type: 'progress', id, done: 4096, total: 8192 });
    s.refs[0].receive({ type: 'progress', id: 999, done: 1, total: 2 });
    expect(s.progress).toEqual([[4096, 8192]]);
  });

  it('dispose terminates every worker', () => {
    const s = setup(2);
    s.scheduler.dispose();
    expect(s.renders.every((r) => r.terminated)).toBe(true);
    expect(s.refs[0].terminated).toBe(true);
  });
});
