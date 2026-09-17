# Review instructions

For automated reviewers and for anyone preparing a change for review.

## Passes

Run three passes and tag each finding with its pass:

- **Bugs**: logic errors, broken edge cases, regressions, failure paths.
- **Security**: injection, authentication and authorisation gaps, secrets or
  personal data in code or logs.
- **Compliance**: the change matches its design and plan, at the locations the
  Documents table in `.gravity/policy.md` names, and the conventions in
  `AGENTS.md`.

## Severity

Tag every finding `Important` or `nit`. `Important` is reserved for a finding
that would break behaviour, leak data or breach a policy. Style and naming are
nits.

## Cap the nits

Report at most five nits; summarise the rest as a count.

## Do not report

Generated files, vendored code, and anything CI already enforces.

## Never approve or block

Findings inform the human reviewer. The pull request is the record.
