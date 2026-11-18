# The chart metric and the Estimated 1RM series are read from the Training log

Status: Superseded by [0031](0031-the-training-log-is-the-only-reading.md).

Best, Records, last session and Tonnage are read from the Training log, in the Profile's unit, with no unit argument. The exercise chart still scored each Entry on its own, and the Estimated 1RM series walked the log again from the formula module. On one mixed-mode Entry those walks disagreed: Best was 90, the chart's reps score was 40. A legacy `topW` of 200 counted as Best while the series stayed on the 100 × 5 set. The series also kept only the first Entry of an exercise in a Workout, while a Record already takes the best estimate across every Entry of that exercise.

Decision: the Training log also reads the chart metric and the Estimated 1RM series. Both take the Profile first. Neither takes a unit argument or a formula argument.

- The chart metric is one Entry's result in its own Mode. Reps load is in the Profile's unit and keeps the chart's current `topW` rule. A hold is in seconds. Cardio is in km/h. It is 0 when the Entry has nothing performed in that Mode.
- Best stays the heaviest performed Work set of any Mode. The two readings are not collapsed. A mixed-mode Entry may still be 90 on Best and 40 on the chart, because a reps chart does not plot a timed set.
- The series has one point per Workout, using the same Estimated 1RM that Workout's Record uses, across every Entry of the exercise. The standing best estimate is the greatest of those points.
- The Epley formula stays where a typed weight and rep count are estimated, including the catalogue calculator. Fatigue keeps its own stimulus formula.

## Considered options

- **Score the chart with Best.** Rejected: Best answers "heaviest load of any Mode." The chart answers "this Entry's Mode" — reps load, hold, or speed.
- **Leave the walks where they are.** Rejected: the chart walk still takes a unit argument, and the series can name a different set than the Record.
- **Share the catalogue formula with Fatigue.** Rejected: Fatigue's formula adds bodyweight and still scores reps above 12. The catalogue formula refuses those reps. Sharing them would change Fatigue.

## Consequences

- A Workout with two Entries of one exercise has one series point, and it matches that Workout's Estimated 1RM Record. The series used to keep only the first Entry.
- A single Entry's chart score does not move. Effort dots and Record marks on the chart stay where they are.
- Deleting a Workout takes its chart point and its series point with it, the same way it takes Best and Records.

Amends ADR 0021.
