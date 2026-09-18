import { expect, test } from '@playwright/test';
import { openViewer, waitForImage } from './helpers';

test('is cross-origin isolated so SharedArrayBuffer is available', async ({ page }) => {
  await openViewer(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
});

test('renders the default view progressively', async ({ page }) => {
  await openViewer(page);
  await waitForImage(page);
});
