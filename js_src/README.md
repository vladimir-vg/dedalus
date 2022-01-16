The idea is to have several implementations of Dedalus, some of which may use existing Datalog engines underneath (Souffle, DataScript, etc.).

Each implementation gonna have its own `*_runtime` directory, with source code independent from other implementation.

# Glossary

 * tuples, someTuples -- array or arrays. Each array element represents single fact
 * facts, someFacts -- Map of key -> tuples. Key has `predicate_name/N` format, where `N` stands for arity. For example for key `fact/3`, tuples array would have triples as elements.
 * tFacts, someTFacts -- Map of timestmap -> facts. Please note `T` prefix.
