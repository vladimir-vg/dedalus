// This is a draft of base class interface that should be used for runtime engines.
// It should be convenient to use, and allow to use third-party implementations underneath.
//
// Having single interface would make it easier to test and compare

/*
  Things to consider
  
  * We may want to run clauses as if it was Datalog, only single step,
    ignoring @next and @async rules.

  * We may want to run particular query, not whole database. Possibly several queries.
  
  * It should be possible to receive tuples from outside. We may consume as soon as possible
  
  * We may want to execute using @next until certain query returns at least one row.
    Or until there would be certain @async tuple send.
*/

// abstract class
class Runtime {
  constructor(clauses, options) {
    this.paused = true;
    this.tillFixpointPromise = null;
    this.fixpointResolve = null;
  }

  // register for output messages
  // key specifies which @async predicate callback is waiting for.
  // if key is not specified, then callback will be triggered
  // for all output @async predicates
  async addOutputListener({ key, callback }) {
    throw new Error('Must be overriden by implementation');
  }

  async removeOutputListener({ key, callback }) {
    throw new Error('Must be overriden by implementation');
  }

  // runs a query against current state
  // basically, works as usual Datalog,
  // does not involve @async or @next rules in computation
  //
  // If runtime is not paused (currently runs tickTillStateFixpoint)
  // then query is ran against one timestamp picked by runtime.
  // so, it should be possible to run query and ticking till fixpoint in parallel.
  async query(expr) {
    throw new Error('Must be overriden by implementation');
  }

  // adds tuples to be received asyncronously, eventually
  // it does not guarantee that all these tuples would be
  // delivered at once
  async enqueueInput({ key, tuples }) {
    throw new Error('Must be overriden by implementation');
  }
 
  // makes single timestamp step computation
  async tick() {
    throw new Error('Must be overriden by implementation');
  }

  // runs ticks over and over, util there is no change in state.
  tickTillStateFixpoint() {
    // if we already have a promise that waits fixpoint then return just it
    if (this.tillFixpointPromise) { return this.tillFixpointPromise; }
  
    let resolveCallback;
    this.tillFixpointPromise = new Promise((resolve, reject) => {
      resolveCallback = resolve;
    });
    
    this._tickTillStateFixpoint(resolveCallback);
    return this.tillFixpointPromise;
  }

  // if runtime runs ticks over and over till fixpoint
  // then it can be paused using this method.
  // You need to pause computation in order
  // to make consistent queries
  async pause() {
    await this._pause();
    this.paused = true;
  }

  //
  // private methods, not supposed to be called by user:
  //

  async _pause() {
    throw new Error('Must be overriden by implementation');
  }

  // should call resolve() once fixpoint is reached
  async _tickTillStateFixpoint(resolve) {
    throw new Error('Must be overriden by implementation');
  }
}
