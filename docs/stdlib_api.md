All response tuples from stdlib runtime are sent once, on next tick or later. `rt:` is just a prefix for the tuple name. It brings no change to the Dedalus semantics. It seems reasonable to use tuples without prefixes only between nodes of the same kind.

# Timers

Scenarios of communication:

```
        -> rt:start_timer(timers, DurationMs, Tag, N)
        <- rt:timer_started(Tag, N)
        <- rt:timer_fired(Tag, N)
```

```
        -> rt:start_timer(timers, DurationMs, Tag, N)
        <- rt:timer_started(Tag, N)
        -> rt:cancel_timer(timers, Tag, N)
        <- rt:timer_cancelled(Tag, N)
```

```
        -> rt:start_timer(timers, DurationMs, Tag, N)
        -> rt:cancel_timer(timers, Tag, N)
        <- rt:timer_cancelled(Tag, N)
```

According to Dedalus semantics `rt:start_timer(...)` tuple not necessairly will be received on next tick. If we do computation in batches (accumulate tuples to send for several ticks, and only then do IO) that indeed may happen.

Field `N` in `rt:start_timer(timers, DurationMs, Tag, N)` must be unique for every `Tag`. If (`Tag`, `N`) pair was already used to create timer before, then runtime must ignore such request and consider it to be invalid.

To implement that, runtime needs to distinguish (`Tag`, `N`) pairs that were served before and not. We could just remember all ids that were already used, but that's bad idea: allocating memory and doing lookups for such a simple thing would be unwise.

Simple solution: we require `N` in `rt:start_timer(...)` to be monotonically increasing. In that case we can safely ignore any `rt:start_timer(...)` request with `N` smaller or equal than the last one for given `Tag`. 

For convenience, we guarantee that for tuples:

```
rt:timer_started(TagA, N)@T_A1.
rt:timer_fired(TagA, N)@T_A2.

rt:timer_started(TagB, M)@T_B1.
rt:timer_cancelled(TagB, M)@T_B2.
```

Following always holds: `T_A1 < T_A2` and `T_B1 < T_B2`. In other words, tuples that notify about start and end of the timer never arrive on the same tick, even if `DurationMs` was set to zero. 

**TODO**: Specify the type of `Tag`. For now it is expected to be a symbol, however, it might be more reasonable to use bytestring. If we add aggregate function to compute hashes of sets of facts as bytestrings, then these hashes might be reasonble to be used as timer tags.

# TODO

 * Random integer in range request.
 * Reading constant env variables specified at startup. Should they be typed? Parsed on request?
 * How `failure:*` tuples are handled by runtime? We should kill node right after receiving such tuple, and not deliver any tuples that were sent after any of failure tuples. This way we can dynamically maintain invariants.
 * Add `div(Dividend, Divisor, Quotient, Remainder)`. This relation potentially may produce unbounded results, that's why its use must be limited, just like use of `successor` is.