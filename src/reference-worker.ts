import { computeReference, toRefMeta, type ReferenceOrbit } from './reference';
import type { FromReferenceWorker, ToReferenceWorker } from './scheduler';
import { scope } from './worker-scope';

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ToReferenceWorker;
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
  const reply: FromReferenceWorker = { type: 'done', id: msg.id, ref: toRefMeta(ref, buffer) };
  scope.postMessage(reply);
};
