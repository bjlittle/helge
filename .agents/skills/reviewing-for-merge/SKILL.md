---
description: Use when acting as an automated reviewer of a pull request or diff, or when preparing a change for review, in a repository with a REVIEW.md. Three passes, findings tagged by pass and severity, nits capped, and no approve or block decision.
license: MIT
metadata:
    github-path: plugins/gravity-sdlc/skills/reviewing-for-merge
    github-ref: refs/heads/main
    github-repo: https://github.com/MetOffice/ai-native-sdlc
    github-tree-sha: 08d595a19730a82cc120c0f4033d7a70a55fd5c7
    version: 0.1.0
name: reviewing-for-merge
---
# Reviewing for merge

## The gate

Findings inform the human reviewer; the reviewer that produced them never
approves and never blocks. The pull request is the record.

## Reviewing

Read `REVIEW.md` at the repository root; its passes, severity meanings, nit
cap and exclusions govern. Then read the design and plan, if they exist. When
the request or the pull request template links them, read those paths.
Otherwise take the change's identity, its intent's `{date}` and `{slug}`, from
the template or the branch name, and resolve the Designs and Plans rows of the
policy's Documents table with it; do not assume they sit beside the intent.

Run the three passes in order and tag each finding with its pass:

- **Bugs**: logic errors, broken edge cases, regressions, failure paths not
  handled.
- **Security**: injection, authentication and authorisation gaps, secrets or
  personal data in code or logs.
- **Compliance**: the change matches its design and plan, and the
  conventions in `AGENTS.md`. A divergence recorded in the plan is not a
  finding; an unrecorded one is.

Tag each finding `Important` or `nit`. `Important` is reserved for a finding
that would break behaviour, leak data or breach a policy; everything else is a
nit. Report at most the number of nits `REVIEW.md` allows (five if unstated)
and summarise the rest as a count. Do not report what `REVIEW.md` excludes.

Each finding names the file and line, states what is wrong and why it matters,
and proposes the change. A finding you cannot support with the code in front
of you is not a finding.

End with the counts per pass and severity and the sentence that no approve or
block decision is made here.

## Preparing a change for review

Fill the pull request template: the change's identity and its intent and design
links, the constraint that shaped the approach, what is deliberately left
undone, the evidence table with each verification command, the revision it ran
at and its result, what was not run and why, and the known weak point. Run the
commands in `.gravity/verification.md` before filling the table; do not copy
expected output.
