import { describe, expect, it } from 'vitest';
import { createHistory, type HistoryLike } from '../src/history';

function fakeWindow(initial = '') {
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const win: HistoryLike = {
    location: { hash: initial },
    history: {
      pushState: (_d, _t, url) => { calls.push(`push:${url}`); win.location.hash = String(url ?? ''); },
      replaceState: (_d, _t, url) => { calls.push(`replace:${url}`); win.location.hash = String(url ?? ''); },
    },
    addEventListener: (_type, fn) => { listeners.add(fn); },
    removeEventListener: (_type, fn) => { listeners.delete(fn); },
  };
  const fire = () => { for (const fn of listeners) fn(); };
  return { win, calls, listeners, fire, external: (hash: string) => { win.location.hash = hash; fire(); } };
}

describe('createHistory', () => {
  it('writes with replace or push and updates the current hash', () => {
    const f = fakeWindow('#start');
    const seen: string[] = [];
    const h = createHistory((hash) => seen.push(hash), f.win);
    h.write('#a', 'replace');
    h.write('#b', 'push');
    expect(f.calls).toEqual(['replace:#a', 'push:#b']);
    expect(h.current()).toBe('#b');
    expect(seen).toEqual([]);
  });

  it('does not rewrite the current hash', () => {
    const f = fakeWindow('#same');
    const h = createHistory(() => {}, f.win);
    h.write('#same', 'push');
    expect(f.calls).toEqual([]);
  });

  it('ignores hashchange events caused by its own writes', () => {
    const f = fakeWindow('');
    const seen: string[] = [];
    const h = createHistory((hash) => seen.push(hash), f.win);
    h.write('#mine', 'replace');
    f.fire();
    expect(seen).toEqual([]);
  });

  it('reports external changes such as the back button', () => {
    const f = fakeWindow('#one');
    const seen: string[] = [];
    createHistory((hash) => seen.push(hash), f.win);
    f.external('#two');
    f.external('#two');
    f.external('#three');
    expect(seen).toEqual(['#two', '#three']);
  });

  it('dispose removes the listener', () => {
    const f = fakeWindow('');
    const seen: string[] = [];
    const h = createHistory((hash) => seen.push(hash), f.win);
    expect(f.listeners.size).toBe(1);
    h.dispose();
    expect(f.listeners.size).toBe(0);
    f.external('#late');
    expect(seen).toEqual([]);
  });
});
