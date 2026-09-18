/** Minimal typing for a dedicated worker's global scope without pulling in the WebWorker lib. */
export interface WorkerScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export const scope = self as unknown as WorkerScope;
