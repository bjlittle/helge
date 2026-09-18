import { expect, test } from '@playwright/test';
import { currentHash, hashParam, openViewer, waitForImage } from './helpers';

test('is cross-origin isolated so SharedArrayBuffer is available', async ({ page }) => {
  await openViewer(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
});

test('renders the default view progressively', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
});

test('wheel zooms in and records the view in the hash', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const before = await currentHash(page);
  expect(hashParam(before, 're')).toBe('-0.5');
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => currentHash(page)).not.toBe(before);
  const after = await currentHash(page);
  expect(Number(hashParam(after, 's'))).toBeLessThan(Number(hashParam(before, 's')));
});

test('drag pans and R resets to the default view', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const before = await currentHash(page);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(500, 340, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => currentHash(page)).not.toBe(before);
  const dragged = await currentHash(page);
  expect(Number(hashParam(dragged, 're'))).toBeLessThan(-0.5);
  expect(Number(hashParam(dragged, 'im'))).toBeGreaterThan(0);
  await page.keyboard.press('r');
  await expect.poll(async () => hashParam(await currentHash(page), 're')).toBe('-0.5');
});

test('the back button returns to the view before the last gesture', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const start = await currentHash(page);
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => currentHash(page)).not.toBe(start);
  await page.waitForTimeout(300);
  await page.goBack();
  await expect.poll(() => currentHash(page)).toBe(start);
  await waitForImage(page);
});

async function samplePixels(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.getElementById('view') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return [];
    const out: number[] = [];
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(((i % 4) + 0.5) * (c.width / 4));
      const y = Math.floor((Math.floor(i / 4) + 0.5) * (c.height / 4));
      const d = ctx.getImageData(x, y, 1, 1).data;
      out.push((d[0] << 16) | (d[1] << 8) | d[2]);
    }
    return out;
  });
}

test('palette change recolours without moving the view', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  await expect.poll(async () => hashParam(await currentHash(page), 'i')).toBe('auto');
  const before = await currentHash(page);
  const pixelsBefore = await samplePixels(page);
  await page.selectOption('#palette', 'fire');
  await expect.poll(async () => hashParam(await currentHash(page), 'p')).toBe('fire');
  const after = await currentHash(page);
  expect(hashParam(after, 're')).toBe(hashParam(before, 're'));
  expect(hashParam(after, 's')).toBe(hashParam(before, 's'));
  await expect.poll(async () => {
    const now = await samplePixels(page);
    return now.filter((v, i) => v !== pixelsBefore[i]).length;
  }).toBeGreaterThan(0);
});

test('the iterations slider overrides the ceiling', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  await page.locator('#iters').fill('12');
  await expect.poll(async () => hashParam(await currentHash(page), 'i')).toBe('4096');
  await expect(page.locator('#auto')).not.toBeChecked();
  await page.locator('#auto').check();
  await expect.poll(async () => hashParam(await currentHash(page), 'i')).toBe('auto');
});

test('help overlay toggles with ? and closes with Escape', async ({ page }) => {
  await openViewer(page);
  await expect(page.locator('#help-overlay')).toBeHidden();
  await page.click('#reset');
  await page.keyboard.press('?');
  await expect(page.locator('#help-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-overlay')).toBeHidden();
});

test('S downloads a PNG with a short name', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  const download = page.waitForEvent('download');
  await page.keyboard.press('s');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^mandelbrot-e-?\d+\.\d-[0-9a-f]{8}\.png$/);
});

test('the readout shows the zoom exponent and iteration ceiling', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
  await expect(page.locator('#zoom')).toHaveText(/^-?0\.00$/);
  await expect(page.locator('#ceiling')).toHaveText(/1[,.]?000/);
  await expect(page.locator('#time')).not.toHaveText('', { timeout: 20_000 });
});
