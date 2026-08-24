Type: grilling
Status: open
Blocked by: 01

## Question

The glossary defines **Day override** with "_Avoid_: rescheduling" (CONTEXT.md, Planning). The UI contradicts this in user-visible copy: `t('rescheduled')` renders on Home (`Home.jsx:68`) and the Start chooser (`Workout.jsx:30`), and `dayOverrideSheet`/`S.dayPlan` sit between the two vocabularies (sheet named override, state field named dayPlan). Note these strings are i18n keys — changing them touches locale packs; how that works after the sky effort's english-only ticket is fog on the map.

Decide: does the copy change to an override-flavored word (glossary wins), or is "rescheduled" genuinely clearer to a gym user than "override" and the glossary should legalize it? Weigh: "override" is engineering vocabulary a lifter never says; the glossary term may itself be the drift here. Also decide the fate of the third name in the family: should `dayPlan` (state field) align with whichever side wins? Record the chosen user-facing string(s), the sheet title, and any CONTEXT.md edit. If glossary wins, list exact string changes for `.scratch/language/rename-plan.md`.
