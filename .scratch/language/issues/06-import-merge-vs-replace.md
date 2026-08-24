Type: grilling
Status: open
Blocked by: 01

## Question

The glossary promises, under **Import**: "Backups and CSV histories merge rather than replace — existing days win, so importing twice never duplicates a workout" (CONTEXT.md, Data & identity). The code contradicts this for JSON backups: `doImport` in `Settings.jsx:39-50` validates then REPLACES wholesale (`replaceState(Object.assign(clone(DEF), data), true)`), and its own confirm dialog says "This replaces all current data with the backup file." Plan-file import (`plan-share.js mergePlan`) does merge; CSV history import needs verifying (import-csv.js) before claiming it honors "existing days win".

Decide which side is the model's truth: (a) the glossary is aspirational and wrong — amend CONTEXT.md to distinguish **Import** (merges: plan files, CSV histories — verify CSV actually merges) from a distinct concept like **Restore** (a backup replaces everything; note CONTEXT.md currently lists "restore" under avoid), or (b) backup import should genuinely merge and that is a behavior change to spec in `.scratch/language/rename-plan.md`. Weigh user safety: a restore-as-replace is arguably what you want from a backup; two words may both deserve glossary entries with crisp boundaries. This decision edits CONTEXT.md either way; record the exact new/changed definitions. Any implementation work itself stays out of scope per the map.
