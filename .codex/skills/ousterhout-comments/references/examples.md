# Examples for writing and cleaning comments

These examples are original illustrations. Their stated semantics are assumptions for the examples, not facts to copy into another codebase. Verify the corresponding behavior before using similar wording.

## Remove narration; keep missing meaning

Redundant:

```python
# Increment the attempt counter.
attempts += 1
```

The statement already communicates the update. Remove the comment. If a limit excludes the initial request, that is a different and useful fact to document beside the limit's declaration.

Assume `retry_limit` counts only requests made after the initial failure:

```python
# Maximum additional requests after the initial request fails.
retry_limit = 3
```

This is a precise semantic definition, even though the identifier is readable. Sections 13.2-13.3.

## Replace a vague field description with a definition

Assume values count bytes, the origin is the beginning of the payload, and the field always identifies the first unsent byte:

```cpp
// Current position.
size_t offset;
```

Rewrite:

```cpp
// Byte offset from the start of the payload to the first byte not yet sent.
size_t offset;
```

For a map, specify both sides and the meaning of absence. Assume the histogram counts response sizes in bytes and omits sizes with no observations:

```python
# Maps response size in bytes to the number of responses of that size.
# Sizes with no observations have no entry.
size_counts: dict[int, int] = {}
```

These comments save readers from inspecting every use. Section 13.3.

## Define a full caller contract

Assume this implementation accepts an inclusive lower bound and exclusive upper bound. The example is complete so that the comment can be checked against it:

```python
def read_window(data: bytes, start: int, stop: int) -> bytes:
    """Return the bytes in the half-open interval [start, stop).

    Both offsets count bytes from the beginning of data. Require
    0 <= start <= stop <= len(data); otherwise raise ValueError.
    Equal offsets return empty bytes. The input is unchanged.
    """
    if not 0 <= start <= stop <= len(data):
        raise ValueError("invalid byte interval")
    return data[start:stop]
```

Callers learn boundaries, units, relationships, the empty case, mutation behavior, and the error. The contract contains enough information to use the function without studying its validation code. Section 13.5.

## Keep a caller-visible progress obligation

Assume `poll()` drives an asynchronous transfer and returns true after completion, including failed completion. Completion is observed separately through `result()`:

```cpp
/**
 * Advance the transfer without waiting for remote input. Call repeatedly
 * until true; no background worker advances this transfer.
 * Returns true when result() can be called without blocking, including
 * when the transfer has failed. result() reports that failure.
 */
bool poll();
```

A rewrite to "Checks whether the transfer is ready" would remove required information. Internal queues and the order of private state checks can stay in implementation comments. Sections 13.5 and 13.9.

## Explain a phase at a higher level

Assume a scheduler reserves eligible tasks before dispatch and this block performs the reservation:

```text
Before: Iterate through the tasks and test each task's state.
After:  Reserve every task eligible for this dispatch cycle so another
        worker cannot select it before dispatch begins.
```

The new comment supplies the intent and the reason the work precedes dispatch. It does not need to narrate each condition. Simple loops may need no comment at all. Sections 13.4 and 13.6.

## Record why a surprising sequence matters

Assume a completion callback can synchronously register another request and that clearing the current request after notification would erase that new registration:

```text
Clear the current request before notifying callbacks. A callback can
register a replacement synchronously; clearing afterward would erase it.
```

Place this beside the clearing and notification block. Preserve it even if the two statements look straightforward. Add a verified issue reference when useful. Keeping the explanation only in a commit message would make it difficult to discover during a later edit. Sections 13.6 and 16.3.

## Move private mechanics out of an interface comment

Assume a cache's internal expiry index is an implementation choice, while its public read returns a miss after expiry:

```text
Interface: Returns the stored value, or a miss if absent or expired.
           Expiry is evaluated when this method is called.

Near the eviction implementation: The expiry index lets eviction inspect
                                the earliest deadline first.
```

The caller needs expiry behavior. The internal index belongs with the code that maintains it. Document units, miss representation, and ownership separately if the actual signature leaves them unresolved. Sections 13.5 and 16.2.

## Consolidate a decision with discoverable references

Assume adding a wire-status value requires updating a decoder table and a language binding:

```cpp
// When adding a status, update the decoder table in wire_decode.cc and
// the matching value in bindings/status.py. See docs/wire.md#status-values
// for the compatibility rule.
```

Put this at the shared status declaration where additions happen. Keep the compatibility explanation in that one design section, and place short references in affected code. Verify every named file and target. Use an existing design document when appropriate; a new `designNotes` file is not required. Sections 13.7 and 16.4.

## Preserve meaningful comments during cleanup

- Keep a verified ownership rule even when the variable's name already includes `buffer`.
- Keep exact endpoint semantics when a function's name includes `range`.
- Preserve a linter suppression and the explanation of why it is needed unless the underlying reason has been resolved within scope.
- Preserve an accurate bug-prevention explanation even when the fix is old.
- Investigate a stale comment that promises a guarantee the implementation violates. Decide from the governing contract whether documentation or code is wrong; report an unresolved conflict.
- When a complicated contract cannot be simplified without omitting requirements, retain those requirements and flag the design problem. A comment cleanup request does not itself authorize redesigning the API.

## Completion checks for representative tasks

| Request | Evidence of a successful result |
| --- | --- |
| Clean noisy comments in a module | Narration is removed; verified contracts, rationale, and tool directives remain; missing declaration semantics are repaired where evidence supports them. |
| Document a new API | The contract is drafted before the body, then checked against the completed behavior and special cases. |
| Review a comment-only change | The review identifies lost knowledge and unsupported claims, rather than rewarding a smaller diff alone. |
| Repair duplicated design notes | One authoritative explanation remains, every relevant reference resolves, and no affected location becomes undiscoverable. |
| Explain an unfamiliar state flag | The comment defines the represented condition and applicable invariant rather than listing assignments. |
