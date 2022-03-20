This is a naive implementation of Dedalus, incredibly beautiful, concise and powerful language.

Dedalus is a Datalog for distributed programming. Related paper: https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-173.html

There is a great talk by Peter Alvaro, one of the authors of the language: https://www.youtube.com/watch?v=R2Aa4PivG0g

# Implementation

Parsing is done via PEG grammar.

Validation consists is mostly of pattern matching, thus it is really convenient to do it in a language like Dedalus. That's why validator of Dedalus AST is written in Dedalus itself: [d_src/validator.dedalus](d_src/validator.dedalus).

Use of negation and aggregation requires stratification of the clauses in the source code. We need to compute proper order of execution that would allow to use aggregation and stratification without loss of monotonicity. The code that performs this stratification process of Dedalus clauses is also implemented in Dedalus: [d_src/stratifier.dedalus](d_src/stratifier.dedalus).

Evaluation itself is done in a naive bottom-to-top approach:

 1. Initially current state is an empty set. Initial timestamp is set to the minimal timestamp in the source code.
 2. If there are facts in the source code for current timestamp -- merge them into state. 
 3. If there are facts in the input queue delivered by @async clauses -- merge them into state.
 4. For each stratum:

    4.1. Select deductive clauses without choice-operators, apply them to current state and merge results to the current state till fixpoint.
    
    4.2. Select deductive clauses with choice-operators, apply them to current state once. Merge results to the current state. 
    
    4.3. If 4.1 or 4.2 produced new facts then go back to 4.1 again. Otherwise go to next stratum.
 
 5. Select `@async` clauses, start async execution of clauses with current state copied. Push results to the input queue eventually.
 6. Select `@next` clauses, apply them to current state. Take result of application as new current state (overwrite).
 7. Increase current timestamp.
 8. Go back to step 2.

Choice operator just randomly selects a row from given set of possibilities. Made choices are remembered for each clause for the duration of the single timestamp tick.

# Testing

In order to run tests, install dependencies `npm install` and then hit `make test`. Testscases themselves are just Dedalus programs.

# Related projects

 * [Imp](https://github.com/jamii/imp). Experimental relational query language in many ways similar to Dedalus. Active development ongoing.
 * [Eve](https://github.com/withEve). Experimental programming environment. Authors of this project said that they took Dedalus semantics as a foundation. Currently inactive.
 * [Bud](https://github.com/bloom-lang/bud). Implementation of Bloom language as a DSL in Ruby. Bloom is the intended successor of the Dedalus language. Currently inactive.
 * [C4 Overlog](https://github.com/bloom-lang/c4/). Overlog is a predecessor of Dedalus language. Seemingly equally powerful, but more complicated. Currently inactive.
