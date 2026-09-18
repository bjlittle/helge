import { fromBlaMeta, type BlaTable } from './bla';
import { renderTile } from './perturb';
import { fromRefMeta, type ReferenceOrbit } from './reference';
import type { FromRenderWorker, ToRenderWorker } from './scheduler';
import { scope } from './worker-scope';

let ref: ReferenceOrbit | null = null;
let bla: BlaTable | null = null;

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToRenderWorker;
  if (msg.type === 'setShared') {
    ref = fromRefMeta(msg.ref);
    bla = msg.bla ? fromBlaMeta(msg.bla) : null;
    return;
  }
  const { job } = msg;
  const out = new Float32Array(job.w * job.h);
  // The scheduler always shares a reference before posting tiles; the fill is a defensive fallback.
  if (ref) renderTile(ref, bla, job, out);
  else out.fill(-1);
  const reply: FromRenderWorker = { type: 'tile', job, data: out };
  scope.postMessage(reply, [out.buffer]);
};
