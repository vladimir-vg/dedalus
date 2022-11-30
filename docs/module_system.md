Would be best to keep composition of Dedalus code as simple as possible.

It is clear, that some of the locations, to which you can send tuples, are part of the runtime. This way developer can make IO with external world, like creating timers or requesting random values. Thus, developer can decompose big system, into several independent nodes that send tuples to each other.

It seems that this is not enough.

According to Dedalus semantics, communication between nodes is asynchronous. Neither delivery nor order are guaranteed. Using asynchronous API requires to write additional code that would maintain current status of every request.

It would be convenient to have synchronous library API without violating Dedalus semantics. For example, we could refer to `stdlib:request_status(...)` tuple, that was produced somewhere in the library. Library rules also may expect user to define rules with certain names, similar to callbacks.

This can be accomplished by simply including library rules together with the application rules. However, this approach doesn't scale -- library rules pollute shared namespace, makes it hard to distinguish what comes from where.

To make it scale we need to introduce namespaces, so that rules defined in one module do not automatically spill into other module.

Dedalus puts certain limitations on rules: dependency cycles can't have negation or aggregation. If library takes user-defined deductive rules as callbacks, they may accidentally form cycles with negation or aggregation. It would be reasonable to require used-defined callback rules to be always inductive (defined as `@next`). This way we avoid this problem.

Node is a set of modules. Each module has its own local facts. Facts with namespace prefix are visible to all modules on same node. Thus, when a module preduces fact `my_module:my_fact(...)` this fact would be visible to all modules.

Any module can define `@async` rule with `failure:` prefix. Once tuple with such prefix produced and sent to `#supervisor`, whole node gets terminated. This way modules can enforce certain invariants.

 * Dedalus source files can be compiled into a single module. For that to happen, all of them must reside in single directory, and have `module(module_name).` as first statement in the source code.
 * All rules produced without namespace prefix are local to module and not visible to other modules.
 * All facts that has namespace prefix are visible to all modules on same node.
 * Deductive rules with `my_module:*` prefix can be defined only inside module code.
 * Inductive (`@next`) and asynchronous (`@async`) rules can be defined in any module for any prefix.

Just like `@async` rules are used to communicate between remote nodes, `@next` rules are used to communicate between modules on the same node synchronously.

