---
description: Use when a design answers an accepted intent, before or alongside the engine's design gate (gravity brainstorming or superpowers). Resolves the design's path from the policy's Documents table, loads the organisation's policy skills, and requires the standard spec sections with flagged concerns resolved before build.
license: MIT
metadata:
    github-path: plugins/gravity-sdlc/skills/specifying-against-policy
    github-ref: refs/heads/main
    github-repo: https://github.com/MetOffice/ai-native-sdlc
    github-tree-sha: 3517df5d1206ba08b88b20f39c4117a4757ede96
    version: 0.1.0
name: specifying-against-policy
---
# Specifying against policy

## The gate

Build does not start until the design carries the sections in
`<docs_root>/changes/_templates/spec-sections.md` and every flagged concern
has a resolution agreed with its owner.

## Before designing

Find the accepted intent (`status: accepted` in its front matter). If none
exists and the change is not an exact mechanical change, use
`capturing-intent` first and stop there.

The design document lives where the Designs row of the policy's Documents
table says, with `{date}` and `{slug}` taken from the intent it answers, so the
chain shares one identity. By default that is `spec.md` in the intent's change
directory; a by-kind or custom layout names another pattern, and the pattern
governs. Resolve the exact path and name it before any design gate fires, so
the engine writes there rather than to its own default. A design with no
intent, for an exact mechanical change that still needs one in the engine's
judgement, takes today's date and a fresh slug at the same pattern.

## Policy skills

Organisation overlays supply policy skills, for security, compliance, brand,
accessibility or similar, whose descriptions name the policy area. Load each
that applies to the affected users and systems. If none is installed, state
that no organisation policy skills are present and move on; do not invent
policy.

## The design

Run the engine's design gate where one is installed, at the named path. Then
check the document against the spec sections: intent link, decisions with
reasons, files and interfaces, out of scope, flagged concerns, verification,
status. Add what is missing.

Flagged concerns is a table of concern, policy area, owner, resolution. Every
conflict between the design and a stated policy goes in it. A concern without
a resolution agreed with the named owner blocks build; ask the owner, do not
assume.

A spec is living: when a statement is found wrong later, replace it rather
than annotating it, and set the status line's date.

## Handing over

Report the path, the unresolved concerns with their owners, and whether the
design is ready for the engine's planning gate.
