import { expect, type Page } from '@playwright/test';

/** Number of distinct colours among sampled canvas pixels. A blank canvas gives 1. */
export async function distinctColours(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('view') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
}

export async function currentHash(page: Page): Promise<string> {
  return page.evaluate(() => location.hash);
}

export function hashParam(hash: string, key: string): string | null {
  return new URLSearchParams(hash.slice(1)).get(key);
}

/** Loads the page and waits until the first pass has painted. */
export async function openViewer(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('view') !== null);
}

export async function waitForImage(page: Page): Promise<void> {
  await expect.poll(() => distinctColours(page), { timeout: 20_000 }).toBeGreaterThan(8);
}
