---
title: Mandelbrot fractal generator and viewer
author: Bill Little
status: draft
date: 2026-09-17
source: human
risk: low
record: https://github.com/bjlittle/wibble/issues/1
supersedes:
---

# Intent: Mandelbrot fractal generator and viewer

## Problem

I don't currently have a way to generate and view Mandelbrot fractals. I'd
really like to have my own custom Mandelbrot fractal generator and viewer.

It's just for my own personal use. Nobody else feels this, and the cost is only
that I can't do something I'd really like to do.

## Proposed outcome

I have my own custom Mandelbrot fractal generator and viewer, and the fractals
it generates display in Chrome.

## Affected users and systems

- Bill Little, the sole user.
- This repository, which will hold the generator and viewer.
- Chrome, as the display target.

## Constraints

- The fractals must display in Chrome.
- Personal use only. No multi-user, hosting or distribution requirements.

## Open questions

- What does "view" need to include beyond rendering a single image: zoom, pan,
  recolouring, saving an image? Settled by Bill Little.
- Does the viewer need to work from a local file with no server, or is a
  locally served page acceptable? Settled by Bill Little.
