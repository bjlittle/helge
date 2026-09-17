---
description: Use when deciding which lifecycle stage a piece of work is in and which artifact it owes before proceeding, or, on explicit request only, when adopting or auditing the AI-native lifecycle in a repository and choosing the next play.
license: MIT
metadata:
    github-path: plugins/gravity-sdlc/skills/using-sdlc
    github-ref: refs/heads/main
    github-repo: https://github.com/MetOffice/ai-native-sdlc
    github-tree-sha: 6f905278ba7e58979dba8ca0b9267e865675574a
    version: 0.1.0
name: using-sdlc
---
# Using the lifecycle

## What this is

The AI-native lifecycle is a loop of six stages, Plan, Design, Build, Test,
Deploy, Maintain, in which each stage commits one artifact the next stage
reads: intent, spec, plan, verified diff, reviewed pull request, incident
record, and an incident's diagnosis re-enters as a new intent. The repository
policy at `.gravity/policy.md` names where each artifact lives (its Documents
table) and how the gates behave. Read it first.

## The stage gate

Before acting on a request, name the stage the work is in and the artifact it
owes, and check the policy's Documents table for the location. Work does not
advance a stage until that artifact exists at that location. The exception is
the intent only: an exact mechanical change with a fully specified result goes
straight to the change, still owes verification and review, and needs a design
or plan only if the engine says so.

| Situation | Stage | Skill |
|---|---|---|
| A problem, need or opportunity is described and no accepted intent exists | Plan | `capturing-intent` |
| An accepted intent needs a design | Design | `specifying-against-policy`, then the engine's design gate |
| An approved design needs sequencing or implementation | Build | the engine's planning and execution gates (gravity `writing-plans`, `executing-plans`; or superpowers) |
| A change is about to be claimed done | Test | the commands in `.gravity/verification.md`; the engine's verification gate |
| A pull request needs an automated reviewer, or is being prepared for review | Deploy | `reviewing-for-merge` |
| A change is about to reach the production environment | Deploy | `gating-deploy` when installed; otherwise the policy's release approval line, by hand |
| A band is breached, an incident opens, or a scan reports | Maintain | `closing-the-loop` when installed; otherwise write the incident record from the template and an intent from its diagnosis |

Where the policy declares `Engine: none`, the Design and Build gates are
absent; say so rather than improvising them.

## Policy

Policy is configuration. Read it; do not write it. Where the work needs a
different choice, propose the amendment to the policy owner and continue under
the current text. Lessons, measurements and history go to the outcome note or
the incident record, never into the policy.

## Adopting or auditing (explicit request only)

If `scripts/sdlc` is absent, the template has not been rendered into this
repository. Say so, give the command `copier copy <template-source> .`
followed by `python scripts/sdlc doctor --retrofit`, and stop; nothing else in
this mode applies until it has run.

Run `python scripts/sdlc doctor` and `python scripts/sdlc ladder` and read
their output rather than inferring state from the tree. Report the current
level with the evidence lines, the checks that warn or fail with their fix
commands, and the `next:` line as the next play. On a retrofit, run
`python scripts/sdlc doctor --retrofit` without `--yes`, show the proposed
changes, and apply them only on agreement. Existing design records, ADRs and
plans count toward level 2 at the policy's locations; propose moving nothing.
