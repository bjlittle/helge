export interface HistoryLike {
  location: { hash: string };
  history: {
    pushState(data: unknown, unused: string, url?: string | URL | null): void;
    replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  };
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

export interface HashHistory {
  write(hash: string, mode: 'replace' | 'push'): void;
  current(): string;
  dispose(): void;
}

/**
 * Writes the view hash via the History API and reports changes that did not come from
 * this module (back button, manual edits). Own writes never trigger `onExternalChange`.
 */
export function createHistory(
  onExternalChange: (hash: string) => void,
  win: HistoryLike = window as HistoryLike,
): HashHistory {
  let lastWritten = win.location.hash;
  const handler = () => {
    const hash = win.location.hash;
    if (hash === lastWritten) return;
    lastWritten = hash;
    onExternalChange(hash);
  };
  win.addEventListener('hashchange', handler);
  return {
    write(hash, mode) {
      if (hash === win.location.hash) return;
      lastWritten = hash;
      if (mode === 'replace') win.history.replaceState(null, '', hash);
      else win.history.pushState(null, '', hash);
    },
    current: () => win.location.hash,
    dispose() {
      win.removeEventListener('hashchange', handler);
    },
  };
}
