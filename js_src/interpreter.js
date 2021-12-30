import _ from 'lodash';

import { mergeDeep } from './ast.js';



const findLineWithNegation = (rules) => {
  const tuples1 = rules.get('ast_body_fact/4');
  const bodyFact = _.find(tuples1, tuple => {
    const [_timestamp, _clauseN, _ruleN, negated] = tuple;
    return negated;
  });
  if (!bodyFact) {
    return null;
  }
  const [_timestamp, clauseN, ruleN, _negated] = bodyFact;
  const tuples2 = rules.get('ast_body_rule/4');
  const [_timestamp, _filename, line] = _.find(tuples2, tuple => {
    const [_timestamp, _filename, _line, clauseN1, ruleN1] = tuple;
    return (clauseN == clauseN1) && (ruleN == ruleN1);
  });
  return line;
};



const produceFactsUsingInductiveRules = (rules, facts) => {
  // Just walk all inductive rules (not @async and not @next)
  // one by one and produce all possible new facts from given facts

  // in order to do that, I need to be able to join tables on variables
  // const table = new Table(facts, key, variables);
};



class Interpreter {
  constructor(initialTimestamp, rules) {
    this.timestamp = initialTimestamp;
    this.rules = rules;

    // facts persisted for current timestamp
    this.prevTickFacts = null;
    this.upcomingTickFacts = new Map();

    // for now no negation is supported
    const line = findLineWithNegation(this.rules);
    if (line) {
      throw new Error(`Negation not supported yet, found one at ${line} line`);
    }
  }

  isStale() {
    // should return true when we reached fixpoint in computation
    // TODO: deep equality check, ignoring tuples order
  }

  insertFactsForNextTick(facts) {
    this.upcomingTickFacts = mergeDeep(this.upcomingTickFacts, facts);
  }

  tick() {
    // naive algorithm. Apply deductive rules and produce new facts
    // until fixpoint is reached. Does not handle negation nor aggregation.
    let accumulatedFacts = new Map();
    let newTuplesCount = 0;
    do {
      const currentFacts = mergeDeep(this.upcomingTickFacts, accumulatedFacts);
      const newFacts = produceFactsUsingInductiveRules(this.rules, currentFacts);
      accumulatedFacts = mergeDeep(accumulatedFacts, newFacts);
      newTuplesCount = _.sum(newFacts.values().map(tuples => tuples.length));
    } while (newTuplesCount > 0);

    // since we don't do any @next rules yet
    // just keep all facts. In future we will compute @next facts
    // and keep only them for next tick

    this.prevTickFacts = mergeDeep(this.upcomingTickFacts, accumulatedFacts);
    this.upcomingTickFacts = new Map();
  }
}



export {
  Interpreter
}