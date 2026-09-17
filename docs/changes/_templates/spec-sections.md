# Sections a design must carry when it answers an intent

A design (spec.md) is a living document: a statement found wrong is replaced,
not annotated. When the design answers an intent, it carries these sections in
this order.

1. **Intent**: link to the intent it answers and its accepted status.
2. **Decisions**: numbered, each with the reason.
3. **Files and interfaces**: what is created or changed, and the interfaces
   others depend on.
4. **Out of scope**: what is knowingly not done.
5. **Flagged concerns**: every conflict with a policy the organisation states,
   as a table of concern, policy area, owner, resolution. Resolved with the
   owner before build starts.
6. **Verification**: the end-to-end check that shows the outcome in the intent
   was reached.
7. **Status**: living; the date the document was last confirmed current.
