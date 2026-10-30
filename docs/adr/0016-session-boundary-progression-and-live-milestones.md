# Session boundary progression and live milestone cues

## Context

Progression models in strength and hypertrophy training (such as linear progression and double progression) raise fundamental questions of timing, granularity, and feedback: should target loads and reps adapt dynamically between sets during an active workout, or should progression evaluate the session as a unified whole? When and how should lifters be notified of their progression status?

Prior to this decision, Sky evaluated progression prescriptions when an active workout was initialized, but active set logging offered no intermediate feedback on whether a completed set met the progression threshold, and the workout completion sheet (`FinishSummary`) omitted progression outcomes entirely.

## Decision

Establish that progression recommendations are scheduled strictly at the **Session boundary**, evaluated across a **unified session**, and paired with **live in-workout milestone cues** and a **completion progression summary**.

1. **Session-Boundary Prescription**:
   - Progression policies (`linear`, `double`, `greyskull`, `time`) evaluate completed work sets and compute the next `Prescription` strictly at the **Session boundary** (when an Active workout completes into a historical Workout).
   - Target loads and reps remain stable across all planned work sets within an active workout. The engine never mutates or recalculates targets for upcoming sets mid-session based on earlier set performance.

2. **Unified Session Evaluation**:
   - Work sets are evaluated collectively as a unified training session rather than independent per-set slots (rejecting Dynamic Double Progression).
   - Under linear progression, all work sets must hit the target reps to advance working load.
   - Under double progression, all work sets must reach the rep range ceiling before the load advances to the next step.

3. **Live Milestone Cues**:
   - As each Work set is checked off, the active workout UI surfaces immediate, inline visual cues indicating progress status:
     - Intermediate sets meeting rep goals indicate target retention (e.g., "12/12 reps hit — on track").
     - Final planned work sets reaching the threshold celebrate unlocking next session's advance (e.g., "All sets hit! +2.5 kg unlocked for next workout").
   - **Non-intrusive**: Displayed as subtle badges on the set row or transient indicators near the rest timer; never as blocking modal dialogs.
   - **Calm & neutral**: Sub-target sets log actual performance quietly without punitive warnings, failure banners, or red styling.
   - **Exclusions**: Warm-up sets are completely excluded from milestone evaluations and cues.
   - **Purely reactive**: Cues immediately clear or recalculate if a set is unchecked or edited to fewer reps.

4. **Workout Complete Progression Summary (`FinishSummary`)**:
   - `FinishSummary` includes a dedicated section listing the derived next Prescription for every trained exercise alongside PRs and volume.
   - Deloads and holds are framed with constructive training guidance (e.g., "Deload 10% to reset and rebuild", "Hold at 60 kg to solidify volume") rather than failure verdicts.

5. **Uniform Policy Model**:
   - The same principles apply across Linear Progression, Double Progression, Greyskull LP (highlighting AMRAP bonus reps and double-increment thresholds), and Add-Time (highlighting hold durations).

## Consequences

- Preserves straight-set progressive overload integrity and eliminates disruptive plate-loading changes during rest intervals.
- Delivers immediate positive reinforcement in the gym without disrupting rest timers or workflow.
- Keeps Sky's progression engine a pure derivation from history, maintaining predictable routine-backed sessions.
