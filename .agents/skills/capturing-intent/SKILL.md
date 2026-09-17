---
description: Use when someone describes a problem, need or opportunity that is not yet an accepted intent, before any design or implementation starts. Writes an intent in the originator's own words to the location the repository policy names and stops for acceptance.
license: MIT
metadata:
    github-path: plugins/gravity-sdlc/skills/capturing-intent
    github-ref: refs/heads/main
    github-repo: https://github.com/MetOffice/ai-native-sdlc
    github-tree-sha: 267b16222d55942fd809f9d5ba97ab450bb4ef6d
    version: 0.1.0
name: capturing-intent
---
# Capturing intent

## The gate

No design and no implementation starts before an intent for the change is
accepted. The exception is an exact mechanical change with a fully specified
result, which owes no intent. If an accepted intent already exists for this
change, this skill does not apply.

## Where it goes

The Intents row of the Documents table in `.gravity/policy.md` gives the
location, with `{date}` the intent's creation date and `{slug}` the lowercase,
hyphenated form of the title. The template is at
`<docs_root>/changes/_templates/intent.md`, where `<docs_root>` is the directory
the policy's paths begin with.

## Writing it

Ask only for what the description leaves open. When the problem, the outcome
that would count as better, and who is affected are already stated, write the
intent now and put anything unsettled under Open questions with who could
settle it; one turn is enough for a draft. When the problem itself is
unclear, ask the smallest set of questions, batched in one message. Anything
with a conventional default is not a question.

Write the intent in the originator's own words; do not translate a problem
into a solution. Fill the front matter: `title`, `author` (the originator, not
the agent), `status: draft`, `date`, `source: human` (or `incident` or `scan`
when the intent comes from the Maintain stage, with the record linked in the
Problem section), `risk` as low, medium or high by the consequence of getting
it wrong, and `record` when the organisation's system of record has an id for
it.

Do not create a design or a plan. Do not change `status`.

## Handing over

Report the path, the pull request that would carry it, and the acceptance
rule: acceptance is the merge of the pull request that sets
`status: accepted`, by the owner the policy's Intent line names. Commit only
under the repository's commit policy; otherwise leave the file in the tree and
say so.
