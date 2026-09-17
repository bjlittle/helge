# Agent instructions for project-wibble

## Commands

Describe how to build, test and lint, with the output a healthy run prints.

## Conventions

State the conventions an agent cannot infer from the code: naming, layout,
review expectations, what must never be edited.

## Architecture

Three to ten lines: the parts, how they connect, where to start reading.

## Things the agent gets wrong

Add a line the second time an agent makes the same mistake.

## Lifecycle

Read and follow `.gravity/policy.md`.
Lifecycle conventions: `docs/sdlc/conventions.md`.

When using superpowers: write design specs to `docs/changes/{date}-{slug}/spec.md` and
implementation plans to `docs/changes/{date}-{slug}/plan.md`, not to `docs/superpowers/`. Before
brainstorming a change that is not an exact mechanical change, check for an
accepted intent at `docs/changes/{date}-{slug}/intent.md` and capture one first if absent. A
design answering an intent includes the sections in
`docs/changes/_templates/spec-sections.md`. Code review follows
`REVIEW.md`.

