# Canonical muscle filters and custom exercise muscle mapping

The exercise library and exercise picker previously filtered exercises by ten coarse body parts (`BODYPARTS`), while the Stats page interactive body map tracked eighteen canonical anatomical muscle groups (`MUSCLES`). Custom exercises could only record a coarse body part, relying on fixed distribution ratios rather than explicit primary and secondary targets.

Decision: Replace the coarse body part filter chips across the Library and Exercise Picker with the eighteen canonical anatomical muscle groups plus cardio in head-to-toe order. Exercises match a filter when the selected muscle is either their primary target (`tg`) or a secondary muscle (`sm`), with secondary matches visually distinguished. Custom exercises now allow lifters to specify a single primary target muscle and optional secondary supporting muscles, deriving the legacy body part automatically for backward compatibility.
