import _ from 'lodash';

import {
  Runtime, RuntimeOutputListener, TFacts, Facts, Program, Clause, Strata,
} from '../runtime';
import { mergeFactsDeep } from '../ast';
import { Table } from './table';



const factsSubset = (keys: string[], facts: Facts): Facts => {
  return (new Map([...facts].filter(([key, _tuples]) => {
    return (key.split('/')[0] in keys);
  })));
};



const produceFactsUsingDeductiveRules = (clauses: Clause[], facts: Facts): Facts => {
  // Just walk all inductive rules (not @async and not @next)
  // one by one and produce all possible new facts from given facts

  return clauses.reduce((newFacts, clause) => {
    const { key, params, bodyFacts, bodyConditions } = clause;
    const positiveBodyFacts = bodyFacts.filter(({ isNegated }) => !isNegated);
    // const positiveBodyFacts = _.sortBy(positiveBodyFacts0, ({ key }) => (facts.get(key) ?? []).length);
    const negativeBodyFacts = bodyFacts.filter(({ isNegated }) => isNegated);
    const positiveTables = positiveBodyFacts.map(({ key, params }) => Table.fromFacts(facts, key, params));
    const negativeTables = negativeBodyFacts.map(({ key, params }) => Table.fromFacts(facts, key, params));
    const table0 = positiveTables.reduce((t1, t2) => t1.naturalJoin(t2));
    const table1 = table0.select(bodyConditions);
    const table2 = negativeTables.reduce((acc, t) => acc.antijoin(t), table1);

    const rows = table2.projectColumns(params);

    // remove rows that are already present
    // so we would return only new facts
    const newRows = rows.filter(row =>
      !_.find(facts.get(key), row2 => _.isEqual(row, row2)))

    const oldRows = newFacts.get(key) ?? [];
    newFacts.set(key, [...oldRows, ...newRows]);
    return newFacts;
  }, new Map());
};



const getStratumComputationOrder = ({ vertices, edges }: Strata): string[] => {
  // there might be several execution orders
  // just pick any for now
  const result = [];
  let edges0 = edges.slice();
  const leftoverStrata = Object.keys(vertices);

  while (edges0.length !== 0 && leftoverStrata.length !== 0) {
    // pick an option and check that nothing depends on it
    const index = _.findIndex(leftoverStrata, (stratum) => {
      return !edges0.some(([parent, child]) => parent == stratum);
    });
    const stratum = leftoverStrata[index];
    result.push(stratum);
    leftoverStrata.splice(index, 1);
    edges0 = edges0.filter(([parent, child]) => child !== stratum);
  }

  return [...result, ...leftoverStrata];
};



class NaiveRuntime implements Runtime {
  program: Program;
  initialTFacts: TFacts;
  strata: Strata;

  paused: boolean;
  currentTimestamp: number;

  // contains set of facts that were either
  // produced using @next rule on previous tick
  // or were given in the source as initial facts
  currentState: Facts;

  // if present, contains all facts that were deducted
  // from current state
  deductedFacts: Facts | null;
  tillFixpointPromise: Promise<void> | null;

  constructor(program: Program, initialTFacts: TFacts, strata: Strata, options?: any) {
    this.program = program;
    this.initialTFacts = initialTFacts;
    this.strata = strata;

    this.paused = true;
    
    this.currentTimestamp = 0;
    if (this.initialTFacts.size !== 0) {
      this.currentTimestamp = [... this.initialTFacts.keys()].reduce((t1, t2) => Math.min(t1,t2));
    }
    this.currentState = this.initialTFacts.get(this.currentTimestamp) ?? (new Map());
    this.deductedFacts = null;

    this.tillFixpointPromise = null;
  }

  addOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void> {
    throw new Error('Not implemented');
  }
  removeOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void> {
    throw new Error('Not implemented');
  }

  query(keys: string[]): Promise<Facts> {
    if (!this.paused) {
      throw new Error('Not implemented');
    }

    if (!this.deductedFacts) {
      this._deductFacts();
    }

    return Promise.resolve(factsSubset(keys, this.deductedFacts));
  }
  
  enqueueInput(facts: Facts) {
    throw new Error('Not implemented');
  }

  tick(): Promise<void> {
    if (!!this.tillFixpointPromise) {
      throw new Error('Till fixpoint computation is ongoing');
    }
    throw new Error('Not implemented');
  }
  
  tickTillStateFixpoint(): Promise<void> {
    // if we already have a promise that waits fixpoint then return just it
    if (this.tillFixpointPromise) { return this.tillFixpointPromise; }
  
    let resolveCallback;
    this.tillFixpointPromise = new Promise((resolve, reject) => {
      resolveCallback = resolve;
    });
    
    throw new Error('Not implemented');
    // return this.tillFixpointPromise;
  }

  isFixpointReached(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): Promise<void> {
    if (this.paused) { return Promise.resolve(); }

    throw new Error('Not implemented');
  }

  ///
  ///
  ///

  private _deductFacts() {
    const stOrder = getStratumComputationOrder(this.strata);
    const { deductive: clauses } = this.program;

    let accumulatedFacts: Facts = new Map();

    stOrder.forEach(stratum => {
      let newTuplesCount = 0;
      let keysUpdated = [... this.currentState.keys()];
  
      do {
        const relevantClauses = clauses.filter(({ key, deps }) => {
          const depsWereUpdated = deps.some(dep => keysUpdated.includes(dep));
          const inCurrentStratum = this.strata.vertices[stratum].includes(key);
          return inCurrentStratum && depsWereUpdated;
        });

        const newFacts = produceFactsUsingDeductiveRules(relevantClauses, accumulatedFacts);
        accumulatedFacts = mergeFactsDeep(accumulatedFacts, newFacts) as Facts;
        newTuplesCount = _.sum([...newFacts.values()].map(tuples => tuples.length));
        keysUpdated = [...newFacts.keys()];
      } while (newTuplesCount > 0);
    });

    this.deductedFacts = mergeFactsDeep(this.currentState, accumulatedFacts) as Facts;
  }
}



export {
  NaiveRuntime,
}