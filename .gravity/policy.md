# Repository policy

Behaviour choices for this repository. Adapters point here; nothing else is
copied. People edit this file; agents read it and propose amendments.

## Ownership

- Policy is edited by humans only; agents propose amendments.

## Commits

- Commit policy: never, unless the user asks; report the state of the tree.

## Permission-required Git operations

- Ask before pushing, amending or rewriting history, or creating a branch.

## Documents

| Kind | Location |
|---|---|
| Intents | `docs/changes/{date}-{slug}/intent.md` |
| Designs | `docs/changes/{date}-{slug}/spec.md` |
| Plans | `docs/changes/{date}-{slug}/plan.md` |
| Records | `docs/changes/{date}-{slug}/outcome.md` |
| Incidents | `docs/incidents/{date}-{slug}/incident.md` |

## Lifecycle

- Artifact chain: intent, design, plan and outcome at the locations in the
  Documents table; a design and a plan answer one intent and sit beside it.
- Intent: required unless the change is an exact mechanical change with a fully
  specified result; accepted by merge of its pull request; owner: product owner.
- A design answering an intent carries the sections in
  `docs/changes/_templates/spec-sections.md`.
- Review findings live in the pull request; automated reviewers follow `REVIEW.md`.
- Records: adopted.
- An outcome is written once, when the work closes; it carries the evidence,
  what was left open and the lessons, so the pull request need not hold them
  after merge.
- Lifecycle gates: enforced.
- Production environment: production.
- Release approval: `RELEASE_APPROVAL`.
- Verification: the commands in `.gravity/verification.md`.

