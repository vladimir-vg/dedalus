# Offensively Crude Dedalus Implementation

I created this prototype to understand Dedalus.

Dedalus is a Datalog for distributed programming. More information: https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-173.html

Great talk by Peter Alvaro, one of the paper authors: https://www.youtube.com/watch?v=R2Aa4PivG0g

# Implementation

Let's just pick existing Datalog implementation and create layer on top of it, so we would get Dedalus semantics. I picked [Datascript](https://github.com/tonsky/datascript) by Nikita Prokopov as Datalog implementation. 

Dedalus has three kinds of rules: deductive, inductive (@next) and @async. How to emulate them?

 * **deductive** -- no need to emulate, run as it is, since it is pure Datalog.
 * **inductive @next** -- explicitly compute a tick. Select last timestamp, run all `@next` rules specifying this last timestamp as current. Collect produced facts, aggregate if necessary, insert them. Tick would need to be triggered for every `#Location` independently over and over.
 * **@async** -- right before computing next tick, produce facts for all `@async` rules. Randomly pick any and insert at current step, so inductive rules could use them. Perform tick for inductive rules, then remove @async facts that we just produced, since we they not supposed to be persisted.

Aggregation is straightforward: just do it before inserting facts back to the database.

# Things to remember

 * Each predicate in the body must have same location. Head may have different location. In that case `#Location` must be specified as a first argument.
