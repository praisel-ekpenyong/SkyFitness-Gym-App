# Taste-skill work notes

## Inspector reduce-motion quirk

This machine's Chrome defaults to `prefers-reduced-motion: reduce`. Because of
that, `inspect.mjs` always reports the accepted `still-page` finding (0 moving
elements) even though the landing page does have motion.

Real motion verification is:

```
node .taste-skill/motion-check.mjs
```

The script forces `prefers-reduced-motion: no-preference` and counts animations
and transitions while scrolling. Fresh run: **47 moving elements**, matching the
spec's earlier evidence. Do not re-run the inspect probe loop on this machine to
chase the still-page result.

## Accepted inspect findings

- `still-page` — environment quirk above, not a page defect.
- `no-footage` — accepted.
- `size-count` — accepted.
