import { blaNodeCount, buildBla, NODE_DOUBLES, toBlaMeta } from './bla';
import { computeReference, toRefMeta, type ReferenceOrbit } from './reference';
import type { FromReferenceWorker, ToReferenceWorker } from './scheduler';
import { scope } from './worker-scope';

let held: { ref: ReferenceOrbit; buffer: SharedArrayBuffer } | null = null;

function buildTable(ref: ReferenceOrbit, delta0Max: number) {
  const buffer = new SharedArrayBuffer(blaNodeCount(ref.length) * NODE_DOUBLES * 8);
  const table = buildBla(ref, delta0Max, new Float64Array(buffer));
  return toBlaMeta(table, buffer);
}

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToReferenceWorker;
  if (msg.type === 'rebuildBla') {
    if (!held) return;
    const reply: FromReferenceWorker = {
      type: 'done', id: msg.id, ref: toRefMeta(held.ref, held.buffer), bla: buildTable(held.ref, msg.delta0Max),
    };
    scope.postMessage(reply);
    return;
  }
  if (msg.type !== 'compute') return;
  const buffer = new SharedArrayBuffer(msg.length * 16);
  const z = new Float64Array(buffer);
  const result = computeReference(msg.centre, msg.length, msg.bits, z, (done) => {
    const progress: FromReferenceWorker = { type: 'progress', id: msg.id, done, total: msg.length };
    scope.postMessage(progress);
    return true;
  });
  const ref: ReferenceOrbit = {
    z, length: result.length, capacity: msg.length, escaped: result.escaped, centre: msg.centre, bits: msg.bits,
  };
  held = { ref, buffer };
  const reply: FromReferenceWorker = {
    type: 'done', id: msg.id, ref: toRefMeta(ref, buffer), bla: buildTable(ref, msg.delta0Max),
  };
  scope.postMessage(reply);
};
