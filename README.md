# Offensively Crude Dedalus Implementation

I created this prototype to understand Dedalus.

Dedalus is a Datalog for distributed programming. More information: https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-173.html

Great talk by Peter Alvaro, one of the paper authors: https://www.youtube.com/watch?v=R2Aa4PivG0g

# Implementation

Let's just pick existing Datalog implementation and create a layer on top of it, so we would get Dedalus semantics. I picked [Datascript](https://github.com/tonsky/datascript) by Nikita Prokopov.

Dedalus extends Datalog with two additional rules: successor() and choose(), which express monotonically growing time and non-deterministic selection of a row. How to match them?

 * **choose** -- there is clear instruction how to express this rule in terms of negation and recursion in such a way, that the only thing left is to assert selected choices from outside. [Greedy algorithms in Datalog with choice and negation](https://dl.acm.org/doi/10.5555/299315.301505), pages 3-4.

 * **successor** -- we just use next timestamp as time argument in all rules. Dedalus syntax doesn't allow to make more than one step in time. Datascript allows to use functions in queries.

Aggregation is straightforward: just do it right before inserting facts back to the database.

# Things to remember

 * Each predicate in the body must have same location. Head may have different location. In that case `#Location` must be specified as a first argument.

 * "The constraints we imposed on Dedalus0 rules restrict how deductions may be made with respect to time. First,rules may only refer to a single time suffix variable in their body, and hence cannot join across different “timesteps”. Second, rules may specify deductions that occur concurrently with their ground facts or in the next timestep—in Dedalus0 , we rule out induction “backwards” in time or “skipping” into the future" (q) Dedalus paper, page 5

