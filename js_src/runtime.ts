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

// enum VType {
//   Integer = "integer",
//   Symbol = "symbol",
//   String = "string",
// }

type Tuples = {
  // for now we don't have information about
  // fields types, thus store values of all types together

  // types: VType[],
  rows: any[][],
}
type Facts = Map<string, Tuples>;
type TFacts = Map<number, Facts>;

type RuntimeOutputListener = (facts: Facts) => void;

type Clause = {
  key: string,
  params: any[],
  bodyFacts: any[],
  bodyConditions: any[],
  
  // produced from bodyFacts
  deps: string[],
}

type Program = {
  deductive: Clause[],
  inductive: Clause[],
  asynchronous: Clause[],
};

type Strata = {
  vertices: {[stratum: string]: string[]},
  edges: string[][], // list of pairs
};

abstract class Runtime {
  paused: boolean;
  tillFixpointPromise: Promise<void> | null;

  constructor(program: Program, initialTFacts: TFacts, strata: Strata, options?: any) {
    this.paused = true;
    this.tillFixpointPromise = null;
  }

  // register for output messages
  // key specifies which @async predicate callback is waiting for.
  // if key is not specified, then callback will be triggered
  // for all output @async predicates
  //
  // promise is resolved only after listener is active
  abstract addOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void>;

  // promise is resolved only after listener was removed
  abstract removeOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void>;

  // runs a query against current state
  // basically, works as usual Datalog,
  // does not involve @async or @next rules in computation
  //
  // if runtime is paused, then query is executed against current state
  //
  // if runtime is not paused (ongoing till fixpoint computation),
  // then query is executed against some state that was not earlier
  // then the query call
  //
  // so, it should be possible to run query and ticking till fixpoint in parallel.
  //
  // Query returns all entries for given keys.
  // User can add desired queries as part of the source code,
  // and then select their values by specifying their keys
  abstract query(keys: string[]): Promise<Facts>;

  // adds tuples to be received asyncronously, eventually
  // it does not guarantee that all these tuples would be
  // delivered at once. It also does not provide any information
  // when they're delivered
  abstract enqueueInput(facts: Facts);
 
  // makes single timestamp step computation
  // promise is resolved once tick was completed
  tick(): Promise<void> {
    if (!!this.tillFixpointPromise) {
      throw new Error('Till fixpoint computation is ongoing');
    }
    return this._tick();
  }

  abstract _tick(): Promise<void>;

  // runs ticks over and over, util there is no change in state.
  // returns promise
  tickTillStateFixpoint(): Promise<void> {
    // if we already have a promise that waits fixpoint then return just it
    if (this.tillFixpointPromise) { return this.tillFixpointPromise; }
  
    let resolveCallback;
    this.tillFixpointPromise = new Promise((resolve, reject) => {
      resolveCallback = resolve;
    });
    
    this._tickTillStateFixpoint(resolveCallback);
    return this.tillFixpointPromise;
  }

  // should call resolve() once fixpoint is reached
  abstract _tickTillStateFixpoint(resolve: () => void): Promise<void>;

  // returns true, if @next rules produce exactly same state as before
  // and input queue is empty.
  //
  // If execution is paused then it returns current status right away
  //
  // If execution is in tickTillStateFixpoint loop,
  // then it would return status that was true some moment in the past.
  //
  // If between isFixpointReached call and result were no enqueueInput calls
  // then positive result can be trusted.
  abstract isFixpointReached(): Promise<boolean>;

  isPaused(): boolean {
    return this.paused;
  }

  // if runtime runs ticks over and over till fixpoint
  // then it can be paused using this method.
  // You need to pause computation in order
  // to make consistent queries
  pause(): Promise<void> {
    if (this.paused) { return Promise.resolve(); }
    return this._pause().then(() => {
      this.paused = true;
      return;
    });
  }

  abstract _pause(): Promise<void>;
};



export {
  Runtime,
  RuntimeOutputListener,
  Program,
  Strata,
  Clause,
  Facts,
  TFacts,
}