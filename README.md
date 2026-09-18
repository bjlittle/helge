# wibble

A personal Mandelbrot fractal generator and viewer for Chrome, with zoom to extreme depth via
perturbation and bilinear approximation.

```bash
npm install
npx playwright install chromium   # once, for the browser test
npm run dev                       # http://localhost:5173/
```

Scroll to zoom about the cursor, drag to pan, double-click to zoom in, `R` to reset, `S` to save a
PNG, `?` for the full key list. Every view is in the URL, so bookmarks and the back button work.

Design: `docs/changes/2026-09-17-mandelbrot-fractal-generator-and-viewer/spec.md`.
