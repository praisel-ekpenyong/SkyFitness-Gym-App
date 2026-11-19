# Exercise notes in Routines, Active workouts, and Routine sync

Status: Accepted, 2026-10-29.

Lifters keep technique cues and machine settings with an exercise, and note what happened in one session. One free-form field serves both.

## Decision

1. **One field, `notes`,** on a Routine exercise, on an Active workout Entry (and its frozen `target`), and on a Workout Entry. A note is stored trimmed and capped at 500 characters (`cleanNote`). An empty note is deleted, never stored empty.
2. **Seeding.** Starting an Active workout from a Routine copies each exercise's note into its Entry. Freestyle workouts and exercises added during a workout copy no note from earlier sessions; they hold only what the lifter types, so an old session's remark never comes back.
3. **Replacement clears the note.** Replacing an exercise drops the outgoing exercise's note: cues do not carry over to a different movement. ADR 0030 applies the same rule in the Routine editor.
4. **Editing in a session** happens in its own sheet, not inline, so the phone keyboard does not shift the set rows.
5. **Routine sync** (ADR 0014) reports a changed or removed note and, when the lifter opts in, writes the session's note back to the Routine. Without opt-in the Routine keeps its note and the Workout keeps the session's.
6. **Carried everywhere an exercise goes.** Plan files (`lib/plan-share.js`) export and import notes. CSV import (`lib/import-csv.js`) attaches a source's exercise notes, such as Hevy's `exercise_notes`.

## Consequences

- One field, not separate "cue" and "log" fields.
- Routines are safe from accidental edits during training; a deliberate cue change goes back through Routine sync.
- Profiles and plan files without notes read unchanged.
