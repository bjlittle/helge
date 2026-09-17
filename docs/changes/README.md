# Changes

One directory per change, named `YYYY-MM-DD-<slug>` from the intent's date and
title. A directory holds the chain for that change:

| File | Written when | Lifecycle |
|---|---|---|
| `intent.md` | someone describes a problem worth solving | frozen once accepted; `status` in its front matter |
| `spec.md` | the intent is accepted and a design is needed | living |
| `plan.md` | the design is approved and the work is multi-step | content frozen at approval; checkboxes ticked during execution |
| `outcome.md` | the work closes, if records are adopted | written once |

Review findings live in the pull request. Incidents live in `../incidents/`.
An exact mechanical change with a fully specified result needs none of this.

Templates are in `_templates/`; they are managed by the template and updated
in place. The policy in `.gravity/policy.md` names the locations.
