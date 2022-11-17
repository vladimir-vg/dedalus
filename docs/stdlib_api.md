All response tuples from stdlib runtime are sent once, on next tick or later. `rt:` is just a prefix for the tuple name. It brings no change to the Dedalus semantics. It seems reasonable to use tuples without prefixes only between nodes of the same kind.

# Timers

Scenarios of communication:

```
at t=N  -> rt:start_timer(timers, DurationMs, Tag, N)
        <- rt:timer_started(Tag, N)
        <- rt:timer_fired(Tag, N)
```

```
at t=N  -> rt:start_timer(timers, DurationMs, Tag, N)
        <- rt:timer_started(Tag, N)
        -> rt:cancel_timer(timers, Tag, N)
        <- rt:timer_cancelled(Tag, N)
```

```
at t=N  -> rt:start_timer(timers, DurationMs, Tag, N)
        -> rt:cancel_timer(timers, Tag, N)
        <- rt:timer_cancelled(Tag, N)
```

According to Dedalus semantics `rt:start_timer(...)` tuple not necessairly will be received on next tick. If we do computation in batches (accumulate tuples to send for several ticks, and only then do IO) that indeed may happen.

Field `N` in `rt:start_timer(timers, DurationMs, Tag, N)` must be unique for every `Tag`. If (`Tag`, `N`) pair was already used to create timer before, then runtime must ignore such request and consider it to be invalid.

To implement that, runtime needs to distinguish (`Tag`, `N`) pairs that were served before and not. We could just remember all ids that were already used, but that's bad idea: allocating memory and doing lookups for such a simple thing would be unwise.

Simple solution: we require that `N` MUST be equal to the current timestamp when `rt:start_timer(...)@async` is computed.

This way we can guarantee that (`Tag`, `N`) won't be used twice.

For convenience, we guarantee that `rt:timer_started(...)` and `rt:timer_fired(...)` are always delivered on different ticks, even if `DurationMs` is zero.