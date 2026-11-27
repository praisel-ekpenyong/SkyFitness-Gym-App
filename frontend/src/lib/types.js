
/** @typedef {'kg' | 'lb'} Unit */

/** @typedef {'none' | 'rir' | 'rpe'} EffortScale */

/** @typedef {'reps' | 'time' | 'cardio'} LoggingMode */

/** @typedef {'low' | 'standard' | 'high'} TrainingStyle */

/** @typedef {'off' | 'linear' | 'greyskull' | 'double' | 'time'} ProgressionPolicy */

/** @typedef {'off' | 'first' | 'up' | 'hold' | 'down' | 'deload'} PrescriptionKind */

/** @typedef {'warmup' | 'work'} SetPhase */

/**
 * Resolved Prescription frozen onto a finished Entry as `plan`.
 * @typedef {Object} PrescriptionRecord
 * @property {PrescriptionKind} kind
 * @property {number} [weight]
 * @property {number} [reps]
 * @property {number} [sec]
 * @property {number} [sets]
 */

/**
 * Concrete next target produced by a progression policy.
 * @typedef {Object} Prescription
 * @property {PrescriptionKind} kind
 * @property {ProgressionPolicy} policy
 * @property {number} [weight]
 * @property {number} [reps]
 * @property {number} [sec]
 * @property {number} [sets]
 * @property {Array<string | number>} [why]
 * @property {number} [by]
 */

/**
 * The fields the Progression summary reads off one entry of the shared reading (ADR 0037).
 * @typedef {Object} ProspectiveReadingLike
 * @property {Prescription} prescription
 * @property {Unit} unit
 * @property {Target} cfg
 * @property {string | null} [d]
 * @property {string | null} [routineId]
 */

/**
 * One dated body-weight entry in `profile.bodyweight`.
 * @typedef {Object} WeighIn
 * @property {string} d - Calendar day key (`YYYY-MM-DD`).
 * @property {number} w - Weight rounded to 1 decimal.
 * @property {number} [t] - Epoch millisecond timestamp.
 * @property {Unit} [unit] - Unit stamp (added on unit switch if absent).
 */

/**
 * Workout reminder configuration in `profile.reminder`.
 * @typedef {Object} Reminder
 * @property {boolean} on
 * @property {string} time - Wall-clock time such as `'08:00'`.
 * @property {string | null} tz - IANA time zone name or null.
 */

/**
 * User-created or catalogue exercise descriptor.
 * @typedef {Object} CustomExercise
 * @property {string} id
 * @property {string} n - Display name.
 * @property {string} bp - Body part.
 * @property {string} [tg] - Primary target muscle slug.
 * @property {string[] | string} [sm] - Secondary muscles.
 * @property {string} [mg] - Catalogue main-group muscle.
 * @property {string} [desc] - Exercise description.
 * @property {string} [eq] - Equipment (`'custom'` for user-created exercises).
 * @property {boolean} [custom]
 * @property {string[]} [st] - Instruction steps on built-in catalogue entries.
 * @property {string} [img] - Still image filename.
 * @property {string} [gif] - Motion clip filename.
 * @property {boolean} [missing] - Present only on unknown-exercise placeholders.
 * @property {string} [name] - Legacy display name alias.
 * @property {string[] | string} [muscleGroups]
 * @property {string[] | string} [muscles]
 * @property {string[] | string} [targetMuscles]
 */

/**
 * Prescribed exercise config in a Routine or frozen on an Entry as `target`.
 * @typedef {Object} Target
 * @property {string} [id] - Exercise ID (present on Routine exercises).
 * @property {string} [rowId] - Stable UI key on Routine exercise rows.
 * @property {number} sets - Planned work set count.
 * @property {LoggingMode} [mode]
 * @property {number} [reps]
 * @property {number} [repsMin]
 * @property {number} [repsMax]
 * @property {number} [weight]
 * @property {number} [sec]
 * @property {number} [min]
 * @property {number} [speed]
 * @property {ProgressionPolicy} [prog]
 * @property {number} [inc]
 * @property {boolean} [bodyweight]
 * @property {boolean} [side]
 * @property {number} [rest]
 * @property {string} [sg] - Superset group ID.
 * @property {string} [notes]
 * @property {string} [name]
 * @property {string} [n]
 */

/**
 * Named, ordered list of exercises with targets.
 * @typedef {Object} Routine
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {ProgressionPolicy} [prog]
 * @property {Target[]} ex
 */

/**
 * One logged performance row inside an Entry.
 * @typedef {Object} SetRow
 * @property {string} [id] - Stable UI key on Active set rows.
 * @property {boolean} done
 * @property {SetPhase} [phase] - `'warmup'` on warm-up sets; absent or `'work'` on work sets.
 * @property {number} [w] - Weight in Entry/Workout/Set unit.
 * @property {number} [r] - Reps performed.
 * @property {number} [sec] - Seconds held.
 * @property {number} [min] - Minutes performed.
 * @property {number} [speed] - Speed in km/h.
 * @property {Unit} [unit] - Per-set unit stamp.
 * @property {number} [rir] - Reps in reserve (0-10, step 0.5).
 * @property {number} [rpe] - Rate of perceived exertion (6-10, step 0.5).
 * @property {LoggingMode} [mode]
 */

/**
 * Muscle metadata frozen onto a finished Entry when a custom exercise is deleted or finished.
 * @typedef {Object} MuscleSnapshot
 * @property {string} [n]
 * @property {string} [bp]
 * @property {string} [tg]
 * @property {string[]} [sm]
 * @property {string} [mg]
 * @property {Record<string, number>} [muscleWeights]
 */

/**
 * One exercise within an ActiveWorkout or finished Workout.
 * @typedef {Object} Entry
 * @property {string} id - Exercise ID.
 * @property {SetRow[]} sets
 * @property {Target | Partial<Target> | null} target
 * @property {PrescriptionRecord | Prescription | null} [plan]
 * @property {string} [sg] - Superset group ID.
 * @property {number} [hw] - Active-session high-water mark of checked work sets.
 * @property {string} [notes]
 * @property {Unit} [unit] - Entry-level unit stamp.
 * @property {number} [topW] - Legacy remembered top weight.
 * @property {string} [n] - Display name stamped when a custom exercise is deleted.
 * @property {MuscleSnapshot} [muscleSnapshot]
 * @property {CustomExercise} [exercise] - Legacy embedded exercise snapshot.
 */

/**
 * Finished, dated training session in `profile.workouts`.
 * @typedef {Object} Workout
 * @property {string} id
 * @property {string} d - Calendar day key (`YYYY-MM-DD`).
 * @property {number} start - Start epoch ms.
 * @property {number} end - End epoch ms.
 * @property {string | null} routineId
 * @property {string} name
 * @property {number | null} bw - Session body weight.
 * @property {Unit} [unit]
 * @property {number} [t] - Legacy timestamp alias.
 * @property {Unit} [bwUnit] - Unit stamp for `bw`.
 * @property {Entry[]} entries
 */

/**
 * In-progress training session in `profile.active`.
 * @typedef {Object} ActiveWorkout
 * @property {string} id
 * @property {string} d - Calendar day key (`YYYY-MM-DD`).
 * @property {number} start - Start epoch ms.
 * @property {string | null} routineId
 * @property {string} name
 * @property {number | null} bw - Session body weight.
 * @property {Unit} [unit]
 * @property {number} cur - Current entry index.
 * @property {number} [layout] - Incremented when entries shift to invalidate hold refs.
 * @property {Entry[]} entries
 */

/**
 * Persistent single-lifter Profile state (`S`).
 * @typedef {Object} Profile
 * @property {number} schemaVersion
 * @property {Unit} unit
 * @property {number} restSec
 * @property {boolean} sound
 * @property {boolean} keepAwake
 * @property {'dark' | 'light'} theme
 * @property {string} accent
 * @property {'male' | 'female'} body
 * @property {number | null} targetW
 * @property {WeighIn[]} bodyweight
 * @property {Routine[]} routines
 * @property {Record<string, string>} week
 * @property {Record<string, string>} dayPlan
 * @property {Workout[]} workouts
 * @property {ActiveWorkout | null} active
 * @property {CustomExercise[]} customEx
 * @property {string} gifSize
 * @property {string[]} favorites
 * @property {Reminder} reminder
 * @property {EffortScale | null} effort
 * @property {number | string | null} lastExport
 * @property {string | null} displayName
 * @property {'male' | 'female' | null} sex
 * @property {number | null} birthYear
 * @property {TrainingStyle} trainingStyle
 * @property {Record<string, [number, number]>} volumeRanges
 * @property {number} [_ts] - Persist timestamp in epoch ms.
 */

export {}
