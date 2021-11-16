Dedalus is incredibly beautiful language, concise and powerful, yet I didn't find any clean implementation of it. I wanted to have correct implementation of the language, so I could play with it and use it in my projects.

Dedalus is a Datalog for distributed programming. More information: https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-173.html

Great talk by Peter Alvaro, designer of the language: https://www.youtube.com/watch?v=R2Aa4PivG0g

# Implementation

The easiest way would be to write naive implementation of Dedalus in some high-level language like JavaScript.

After first correct implementation is acquired and test suite formed, we could think about speed. We could either use one of the existing Datalog engines (or [C4 implementation of Overlof](https://github.com/bloom-lang/c4/)) underneath or apply our own optimizations to initial implementation.

Non-deterministic `choose` rule can be expressed in terms of negation and recursion in such a way, that the only thing left is to assert selected choices as facts. [Greedy algorithms in Datalog with choice and negation](https://dl.acm.org/doi/10.5555/299315.301505), pages 3-4.

# Things to remember

 * Only in `@async` rules some variables may be marked with location prefix: `#Location`. In that case, all rules in the body must use same `#Location` variable in their body.

 * All variables in the head must appear in non-negated rules in the body.

 * If we have negation in the body, then all variables used in negated rule must appear in positive rules of the same body.

 * Explicit `@N` time suffixes are allowed only in `@async` rules. And if they are used, then all rules in the body must have same suffix.

 * "The constraints we imposed on Dedalus0 rules restrict how deductions may be made with respect to time. First,rules may only refer to a single time suffix variable in their body, and hence cannot join across different “timesteps”. Second, rules may specify deductions that occur concurrently with their ground facts or in the next timestep—in Dedalus0 , we rule out induction “backwards” in time or “skipping” into the future" (q) Dedalus paper, page 5

# TODO

 0. [ ] PEGJS parser that takes in source file and spits out collection of JS arrays that represent AST (with line numbers)
 1. [ ] Dedalus code that deducts whether given AST is correct Dedalus program. Should produce error facts with descriptions and line numbers.
 2. [ ] Dedalus code that would transform rules with choose rule to equivalent that rely on presence of asserted choice fact.
 3. [ ] Pretty printer for Dedalus AST
 4. [ ] Testing system


