# Exercise notes in Routines, Active workouts, and Routine sync

## Context

Lifters frequently need to record technique cues, machine settings (e.g., seat heights, pin numbers, bench angles), or workout-specific observations (e.g., joint tweaks, tempo adjustments). Prior to this decision, Sky had no note storage on exercises in either Routines or Workouts.

## Decision

Introduce a unified **Exercise note** model across Routines, Active workouts, and historical Workout records, integrated with the Routine sync seam.

1. **Unified Schema (`notes`)**:
   - A single free-form string field `notes` on exercise entries across all lifecycle stages:
     - Routine templates: `routine.ex[i].notes`
     - Active session entries: `active.entries[i].notes` (and preserved on `active.entries[i].target.notes`)
     - Historical workout records: `workout.entries[i].notes`
   - Stored notes are trimmed of leading/trailing whitespace; empty or whitespace-only strings are deleted/omitted to keep payloads compact.

2. **Seeding and Replacement Rules**:
   - Starting an Active workout from a Routine copies `routine.ex[i].notes` into `active.entries[i].notes`.
   - Freestyle workouts and ad-hoc exercises added during a workout start with an empty note (`notes: undefined`), preventing stale session-specific remarks from past workouts from accidentally resurrecting into new sessions.
   - Replacing an exercise (`replaceActiveExercise`) clears the outgoing exercise's note, as equipment and technique cues do not transfer across different movements.

3. **In-Session Editing Surface**:
   - Tapping an existing note callout box (`.exnote`) or the "Add note" header icon button in the Active workout opens a dedicated bottom sheet (`exerciseNoteSheet`) with an auto-focused multi-line `TextArea`.
   - This keeps the live workout card clean and avoids viewport jumps and layout disruptions from mobile virtual keyboards during set logging.

4. **Routine Sync Seam Integration (`lib/routine-sync.js`)**:
   - Pure domain function `diffRoutineWithSession` compares active session notes against the originating routine:
     - New/updated note: produces `{Exercise}: note updated` in the change descriptor.
     - Cleared note: produces `{Exercise}: note removed` in the change descriptor.
   - `syncedEx` projects the session's active note (or omission) into the synchronized exercise array.
   - `FinishSummary` displays the note change alongside set and structural changes under the opt-in toggle. If toggled off, the Routine retains its original note while the historical Workout entry saves the session's note.

5. **Routine Editing and History Review**:
   - `ExConfig` provides a dedicated "Notes & cues" input section using `TextArea`.
   - `RoutineEdit` displays a subtle one-line note preview beneath exercise headers.
   - `WorkoutDetail` renders the recorded note beneath completed sets for each exercise in historical workout logs.
   - Plan files (`lib/plan-share.js`) export and import `notes` within `cleanEx`.
   - CSV import (`lib/import-csv.js`) attaches non-empty exercise notes (e.g., Hevy's `exercise_notes`) to imported entries.

## Consequences

- Lifters can maintain persistent setup cues while also freely noting session observations during active workouts.
- Routine templates remain protected from accidental edits during training, while deliberate cue updates can be committed effortlessly via Routine sync.
- Avoids dual-field complexity ("cue" vs "log") on mobile screens.
- Completely static, local-first, and backwards-compatible with existing profiles and plan bundles.
