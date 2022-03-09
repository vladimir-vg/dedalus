import _ from 'lodash';
import hash from 'object-hash';

import {
  Runtime, RuntimeOutputListener, TFacts, Facts, Program, Clause, Strata,
} from '../runtime';
import { mergeFactsDeep } from '../ast';
import { Table } from './table';



const factsSubset = (keys: string[], facts: Facts): Facts => {
  return (new Map([...facts].filter(([key, _tuples]) => {
    return keys.includes(key);
  })));
};



const produceFacts = (clauses: Clause[], inputFacts: Facts, choicesMade: any)
: { facts: Facts, choicesMade: any } => {
  // Just walk all clauses one by one and produce all possible new facts
  // from given facts deductively
  return clauses.reduce(({ facts: newFacts, choicesMade }, clause, index) => {
    // debugger
    const { key, params, bodyFacts, bodyConditions, chooseExprs } = clause;
    const positiveBodyFacts = bodyFacts.filter(({ isNegated }) => !isNegated);
    const negativeBodyFacts = bodyFacts.filter(({ isNegated }) => isNegated);
    const positiveTables = positiveBodyFacts.map(({ key, params }) =>
      Table.fromFacts(inputFacts, key, params));
    const negativeTables = negativeBodyFacts.map(({ key, params }) =>
      Table.fromFacts(inputFacts, key, params));
    const table0 = positiveTables.reduce((t1, t2) => t1.naturalJoin(t2));
    const table1 = table0.select(bodyConditions);
    const table2 = negativeTables.reduce((acc, t) => acc.antijoin(t), table1);

    // at this point we selected all positive facts, filtered them out
    // and removed rows that don't satisfy negated goals
    //
    // now we can apply non-deterministic choice
    
    // order at which we apply choice operators may affect
    // frequency of different outcomes. Just in case, shuffle.
    const chooseExprs1 = _.shuffle(chooseExprs);
    const choiceFn = (rows) => _.sample(rows);
    const keyFn = (value) => hash([key, index, value]);
    const { table: table3, choicesMade: newChoicesMade } =
      chooseExprs1.reduce(({ table: accTable, choicesMade: accChoicesMade }, { keyVars, rowVars }) =>
        accTable.groupAndChoose(keyVars, rowVars, keyFn, accChoicesMade, choiceFn),
      { table: table2, choicesMade });

    const rows = table3.projectColumns(params);

    const collectedRows = newFacts.get(key) ?? [];
    newFacts.set(key, [...collectedRows, ...rows]);
    return { facts: newFacts, choicesMade: newChoicesMade };
  }, { facts: (new Map()), choicesMade });
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
    // debugger
    const stratum = leftoverStrata[index];
    result.push(stratum);
    leftoverStrata.splice(index, 1);
    edges0 = edges0.filter(([parent, child]) => child !== stratum);
  }

  return [...result, ...leftoverStrata];
};



const countUniqFacts = (facts: Facts): number => {
  return [... facts.values()]
    .map(tuples => tuples.length)
    .reduce((a, b) => a+b, 0);
}



class NaiveRuntime implements Runtime {
  program: Program;
  initialTFacts: TFacts;
  strata: Strata;

  // paused: boolean;
  currentTimestamp: number;

  // contains set of facts that were either
  // produced using @next rule on previous tick
  // or were given in the source as initial facts
  currentState: Facts;
  prevState: Facts | null;

  // if present, contains all facts that were deducted
  // from current state
  deductedFacts: Facts | null;
  tillFixpointPromise: Promise<void> | null;
  // fixpointResolveCallback: () => void | null;

  constructor(program: Program, initialTFacts: TFacts, strata: Strata, options?: any) {
    this.program = program;
    this.initialTFacts = initialTFacts;
    this.strata = strata;

    // this.paused = true;
    
    this.currentTimestamp = 0;
    if (this.initialTFacts.size !== 0) {
      this.currentTimestamp = [... this.initialTFacts.keys()].reduce((t1, t2) => Math.min(t1,t2));
    }
    this.currentState = this.initialTFacts.get(this.currentTimestamp) ?? (new Map());
    this.deductedFacts = null;
// debugger
    this.tillFixpointPromise = null;
    // this.fixpointResolveCallback = null;
  }

  addOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void> {
    throw new Error('Not implemented');
  }
  removeOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void> {
    throw new Error('Not implemented');
  }

  query(keys: string[]): Promise<Facts> {
    // if (!this.paused) {
    //   throw new Error('Not implemented');
    // }

    if (!this.deductedFacts) {
      this._deductFacts();
    }

    const result = factsSubset(keys, this.deductedFacts);
    // debugger
    return Promise.resolve(result);
  }
  
  enqueueInput(facts: Facts) {
    throw new Error('Not implemented');
  }

  tick(): Promise<void> {
    if (!!this.tillFixpointPromise) {
      throw new Error('Till fixpoint computation is ongoing');
    }
    return this._loopTick();
  }
  
  tickTillStateFixpoint(): Promise<void> {
    // if we already have a promise that waits fixpoint then return just it
    if (this.tillFixpointPromise) { return this.tillFixpointPromise; }

    const iter = (resolve, reject) => {
      this.isFixpointReached().then(isReached => {
        if (isReached) {
          resolve();
          this.tillFixpointPromise = null;
          return;
        }
        this._loopTick().then(() => iter(resolve, reject));
      })
    }

    this.tillFixpointPromise = new Promise(iter);
    return this.tillFixpointPromise;
  }

  getCurrentTimestamp(): number {
    return this.currentTimestamp;
  }

  isFixpointReached(): Promise<boolean> {
    if (!this.prevState) {
      // if we haven't even made a single step
      // then we don't know for sure whether it is reached
      return Promise.resolve(false);
    }

    // if (!this.isPaused()) {
    //   throw new Error('Not implemented');
    // }

    // There must be efficient way to compare whether facts are same
    // for now we do stupid thing: count number of tuples,
    // merge facts. If after merge number of tuples stayed the same,
    // then they muse be same.

    const uniqFactsCount1 = countUniqFacts(this.currentState);
    const uniqFactsCount2 = countUniqFacts(this.prevState);
    const uniqFactsCount3 = countUniqFacts(mergeFactsDeep(this.currentState, this.prevState) as Facts);
    // debugger
    const isFixpoint = (uniqFactsCount1 == uniqFactsCount2) && (uniqFactsCount2 == uniqFactsCount3);
    return Promise.resolve(isFixpoint);
  }

  isPaused(): boolean {
    throw new Error('Not implemented');

    // if promise is present, then ticking in the loop
    // return this.paused;
  }

  pause(): Promise<void> {
    // if (this.paused) { return Promise.resolve(); }

    throw new Error('Not implemented');
  }

  ///
  ///
  ///

  private _deductFacts() {
    const stOrder = getStratumComputationOrder(this.strata);
    const { deductive: clauses } = this.program;
    
    // deterministic & non-deterministic (has choose)
    const dClauses = clauses.filter(({ chooseExprs }) => chooseExprs.length == 0);
    const ndClauses = clauses.filter(({ chooseExprs }) => chooseExprs.length != 0);

    let accumulatedFacts: Facts = this.currentState;
    
    stOrder.forEach(stratum => {
      const relevantDClauses = dClauses.filter(({ key }) => 
      this.strata.vertices[stratum].includes(key));
      const relevantNDClauses = ndClauses.filter(({ key }) => 
      this.strata.vertices[stratum].includes(key));
      
      let newDTuplesCount = 0;
      let newNDTuplesCount = 0;
      let choicesMade = {};
      do {
        do {
          const { facts: newFacts } = produceFacts(relevantDClauses, accumulatedFacts, null);
          const accumulatedFacts0 = mergeFactsDeep(accumulatedFacts, newFacts) as Facts;
          newDTuplesCount = countUniqFacts(accumulatedFacts0) - countUniqFacts(accumulatedFacts);
          accumulatedFacts = accumulatedFacts0;
        } while (newDTuplesCount > 0);

        // at this point we deducted all facts that we could using deterministic clauses
        // now we gonna make one pass on non-deterministic clauses
        // if they produce anything, then we need to repeat cycle again
        //
        // Because we run only one pass on clauses with choose and then run the rest of
        // deductive clauses in the loop, we provide more rows to choose from.
        const { facts: newFacts, choicesMade: newChoicesMade } =
          produceFacts(relevantNDClauses, accumulatedFacts, choicesMade);
        choicesMade = newChoicesMade;
        const accumulatedFacts0 = mergeFactsDeep(accumulatedFacts, newFacts) as Facts;
        newNDTuplesCount = countUniqFacts(accumulatedFacts0) - countUniqFacts(accumulatedFacts);
        accumulatedFacts = accumulatedFacts0;
      } while (newNDTuplesCount > 0);
    });
// debugger
    this.deductedFacts = mergeFactsDeep(this.currentState, accumulatedFacts) as Facts;
  }

  private _inductFacts(): Facts {
    if (!this.deductedFacts) {
      this._deductFacts();
    }
    const { inductive: clauses } = this.program;
    // const dClauses = clauses.filter(({ chooseExprs }) => chooseExprs.length == 0);
    // const ndClauses = clauses.filter(({ chooseExprs }) => chooseExprs.length != 0);
    // inductive clauses don't depend on each other and don't have cycles
    // we can compute next state just walking all clauses in one pass
    // debugger
    const { facts: inductedFacts } = produceFacts(clauses, this.deductedFacts, {});
    // stupid way to remove duplicates
    // TODO: replace with something more efficient
    // const inductedFacts = mergeFactsDeep(inductedFacts1, inductedFacts2);
    const inductedFactsWithoutDuplicates = mergeFactsDeep(inductedFacts, inductedFacts) as Facts;
    return inductedFactsWithoutDuplicates;
  }

  private _loopTick(): Promise<void> {
    const facts = this._inductFacts();
    this.prevState = this.currentState;
    this.currentTimestamp += 1;
    const initialFacts = this.initialTFacts.get(this.currentTimestamp) ?? (new Map());

    this.currentState = mergeFactsDeep(facts, initialFacts) as Facts;
debugger
    // this we moved to next timestamp and updated state
    // we need to clear cached deductedFacts
    this.deductedFacts = null;
    return Promise.resolve();
  }
}



export {
  NaiveRuntime,
}