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
