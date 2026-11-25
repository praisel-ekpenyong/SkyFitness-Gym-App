# Taste-skill work notes

## Inspector reduce-motion quirk

This machine's Chrome defaults to `prefers-reduced-motion: reduce`. Because of
that, `inspect.mjs` always reports the accepted `still-page` finding (0 moving
elements) even though the landing page does have motion.

## Accepted inspect findings

- `still-page` — environment quirk above, not a page defect.
- `no-footage` — accepted.
- `size-count` — accepted.
