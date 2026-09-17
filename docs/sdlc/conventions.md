# Lifecycle conventions

Read by agents when `AGENTS.md` points here. Short on purpose.

- The chain is intent, spec, plan, pull request, outcome. Locations are in the
  Documents table of `.gravity/policy.md`.
- An intent is required unless the change is an exact mechanical change with a
  fully specified result. Write it in the originator's words, status `draft`,
  and stop for acceptance. Acceptance is the merge of its pull request.
- A design that answers an intent carries the sections listed in
  `changes/_templates/spec-sections.md`, including flagged concerns resolved
  with their owners before build.
- Before claiming any task done, run the commands in
  `.gravity/verification.md` and paste the output.
- Review under `REVIEW.md`: three passes, findings tagged by pass and severity,
  nits capped; the reviewer never approves or blocks.
- Lessons go to the outcome note or the incident record, never into the policy.
