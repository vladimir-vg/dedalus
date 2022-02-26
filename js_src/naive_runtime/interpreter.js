import { performance } from 'perf_hooks';

import _ from 'lodash';

import { mergeFactsDeep } from '../ast';
import { Table } from './table.js';
import { ast2program } from '../program';



const produceFactsUsingDeductiveRules = (clauses, facts) => {
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



const getStratumComputationOrder = ({ vertices, edges }) => {
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

const getRulesForStratum = (astRules, strata, stratum) => {
  const { vertices } = strata;
  const whitelist = vertices[stratum];

  const filteredAstRules = (new Map([...astRules].map(([key, tuples]) => {
    switch (key) {
      case 'ast_clause/3':
        const filteredTuples = tuples.filter(t => {
          const [name1, _id, _suffix] = t;
          const [name, _arity] = name1['symbol'].split('/');
          return whitelist.some(e => e == name);
        });
        return [key, filteredTuples];
      default: return [key, tuples];
    }
  })));

  return filteredAstRules;
};



class Interpreter {
  constructor({ initialTimestamp, rules, strata }) {
    this.timestamp = initialTimestamp;
    this.rules = rules;
    this.strata = strata;

    // facts persisted for current timestamp
    this.prevTickFacts = null;
    this.upcomingTickFacts = new Map();
  }

  // isStale() {
  //   // should return true when we reached fixpoint in computation
  //   // TODO: deep equality check, ignoring tuples order
  // }

  insertFactsForNextTick(facts) {
    this.upcomingTickFacts = mergeFactsDeep(this.upcomingTickFacts, facts);
  }

  deductFacts() {
    let accumulatedFacts = this.upcomingTickFacts;
    const stOrder = getStratumComputationOrder(this.strata);
    stOrder.forEach(stratum => {
      let newTuplesCount = 0;
  
      const rules = getRulesForStratum(this.rules, this.strata, stratum);
      // collect all deductive rules
      // { key, params, bodyFacts: [{ key, params }, ...], bodyConditions: [[a, op, b], ...] }
      // conditions must come after facts in the body

      // const t0 = performance.now();
      const { deductive: clauses } = ast2program(rules);
      // const clauses = prepareDeductiveClauses(rules);
      // const t1 = performance.now();
      // console.log({ prepare: t1-t0 });
      
      let keysUpdated = [...accumulatedFacts.keys()];
  
      do {
        const relevantClauses = clauses.filter(({ deps }) =>
          deps.some(dep => keysUpdated.includes(dep)));

        // const t2 = performance.now();
        const newFacts = produceFactsUsingDeductiveRules(relevantClauses, accumulatedFacts);
        // const t3 = performance.now();
        accumulatedFacts = mergeFactsDeep(accumulatedFacts, newFacts);
        newTuplesCount = _.sum([...newFacts.values()].map(tuples => tuples.length));
        // console.log({ produce: t3-t2, clausesCount: relevantClauses.length });
        keysUpdated = [...newFacts.keys()];
      } while (newTuplesCount > 0);
    });

    return mergeFactsDeep(this.upcomingTickFacts, accumulatedFacts);
  }

  tick() {
    throw new Error('Not Implemented');
    // // naive algorithm. Apply deductive rules and produce new facts
    // // until fixpoint is reached. Does not handle negation nor aggregation.
    // let accumulatedFacts = new Map();
    // let newTuplesCount = 0;
    // do {
    //   const currentFacts = mergeDeep(this.upcomingTickFacts, accumulatedFacts);
    //   const newFacts = produceFactsUsingInductiveRules(this.rules, currentFacts);
    //   accumulatedFacts = mergeDeep(accumulatedFacts, newFacts);
    //   newTuplesCount = _.sum(newFacts.values().map(tuples => tuples.length));
    // } while (newTuplesCount > 0);

    // // since we don't do any @next rules yet
    // // just keep all facts. In future we will compute @next facts
    // // and keep only them for next tick

    // this.prevTickFacts = mergeDeep(this.upcomingTickFacts, accumulatedFacts);
    // this.upcomingTickFacts = new Map();
  }
}



export {
  Interpreter
}