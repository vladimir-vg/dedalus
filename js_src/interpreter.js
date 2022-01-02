import _ from 'lodash';

import { mergeDeep } from './ast.js';
import { Table } from './table.js';



const findLineWithNegation = (rules) => {
  const tuples1 = rules.get('ast_body_fact/4');
  const bodyFact = _.find(tuples1, tuple => {
    const [_timestamp0, _clauseN0, _ruleN0, negated] = tuple;
    return _.isEqual(negated, { symbol: 'true' });
  });
  if (!bodyFact) {
    return null;
  }
  const [_timestamp1, clauseN, ruleN, _negated1] = bodyFact;
  const tuples2 = rules.get('ast_body_rule/4');
  const [_timestamp2, _filename2, line] = _.find(tuples2, tuple => {
    const [_timestamp3, _filename3, _line3, clauseN1, ruleN1] = tuple;
    return (clauseN == clauseN1) && (ruleN == ruleN1);
  });
  return line;
};



const collectValuesFromFacts = (ast, selectors) => {
  // { key, filter, selectValue, selectIndex }
  const result = [];
  selectors.forEach(({ key, keep, selectValue, selectIndex }) => {
    (ast.get(key) ?? []).forEach(row => {
      if (!keep(row)) { return; }
      const index = selectIndex(row);
      result[index] = selectValue(row);
    });
  });
  return result;
};

const collectBodyFacts = (ast, clauseN) => {
  const items = [];

  (ast.get('ast_body_rule/4') ?? []).forEach(bTuple => {
    const [_t, _f, _l,clauseN1, ruleN] = bTuple;
    if (clauseN != clauseN1) { return; }

    const bodyFact = _.find(
        (ast.get('ast_body_fact/4') ?? []),
        (fTuple) => {
          const [_t, clauseN2, ruleN2, _name, _n] = fTuple;
          return (clauseN2 == clauseN) && (ruleN == ruleN2);
        });
    
    if (!bodyFact) { return; }
    const [_t1, _c1, _r1, name, _n] = bodyFact;

    const valueCollector = (key, isVar) => ({
      key,
      keep: (row) => (row[1] == clauseN) && (row[2] == ruleN),
      selectValue: (row) => isVar ? row[4]['symbol'] : row[4],
      selectIndex: (row) => row[3],
    });

    const params = collectValuesFromFacts(ast, [
      valueCollector('ast_body_var_arg/5', true),
      valueCollector('ast_body_int_arg/4'),
      valueCollector('ast_body_str_arg/4'),
      valueCollector('ast_body_sym_arg/4'),
    ]);
    const key = `${name['symbol']}/${params.length}`;

    items.push({ key, params });
  });

  return items;
};

const collectBodyConditions = (ast, clauseN) => {
  const items = [];
  (ast.get('ast_body_binop/3') ?? []).forEach(tuple => {
    const [_t, clauseN1, ruleN, op] = tuple;
    if (clauseN1 != clauseN) { return; }

    const valueCollector = (key, isVar) => ({
      key,
      keep: (row) => (row[1] == clauseN) && (row[2] == ruleN),
      selectValue: (row) => isVar ? row[4]['symbol'] : row[4],
      selectIndex: (row) => row[3],
    });

    const params = collectValuesFromFacts(ast, [
      valueCollector('ast_body_var_arg/5', true),
      valueCollector('ast_body_int_arg/4'),
      valueCollector('ast_body_str_arg/4'),
      valueCollector('ast_body_sym_arg/4'),
    ]);

    items.push([params[0], op['symbol'], params[1]]);
  });

  return items;
};

const prepareDeductiveClauses = (ast) => {
  const clauses = [];
  (ast.get('ast_clause/5') ?? []).forEach(cTuple => {
    const [_t, _f, _l, name, clauseN, suffix] = cTuple;
    // we are interested only in deductive rules
    if (!_.isEqual(suffix, {symbol: 'none'})) { return; }

    const valueCollector = (key, isVar) => ({
      key,
      keep: (row) => (row[1] == clauseN),
      selectValue: (row) => isVar ? row[3]['symbol'] : row[3],
      selectIndex: (row) => row[2],
    });

    const params = collectValuesFromFacts(ast, [
      valueCollector('ast_clause_var_arg/5', true),
      valueCollector('ast_clause_int_arg/3'),
      valueCollector('ast_clause_str_arg/3'),
      valueCollector('ast_clause_sym_arg/3'),
    ]);
    const key = `${name['symbol']}/${params.length}`;

    const bodyFacts = collectBodyFacts(ast, clauseN);
    const bodyConditions = collectBodyConditions(ast, clauseN);

    clauses.push({ key, params, bodyFacts, bodyConditions });
  });
  return clauses;
};



const produceFactsUsingDeductiveRules = (timestamp, astRules, facts) => {
  // Just walk all inductive rules (not @async and not @next)
  // one by one and produce all possible new facts from given facts

  // collect all inductive rules
  // { key, params, bodyFacts: [{ key, params }, ...], bodyConditions: [[a, op, b], ...] }
  // conditions must come after facts in the body
  const clauses = prepareDeductiveClauses(astRules);

  return clauses.reduce((newFacts, clause) => {
    const { key, params, bodyFacts, bodyConditions } = clause;
    if (key === 'err_time_suffix_not_in_async_rule/3') debugger;
    const tables = bodyFacts.map(({ key, params }) => Table.fromFacts(facts, key, params));
    const table0 = tables.reduce((t1, t2) => t1.join(t2));
    const table1 = table0.select(bodyConditions);

    // add timestamp constant ast first column
    const params1 = [timestamp, ...params];
    const rows = table1.projectColumns(params1);

    // remove rows that are already present
    // so we would return only new facts
    const newRows = rows.filter(row =>
      !_.find(facts.get(key), row2 => _.isEqual(row, row2)))

    return mergeDeep(newFacts, { [key]: newRows });
  }, new Map());
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

  // isStale() {
  //   // should return true when we reached fixpoint in computation
  //   // TODO: deep equality check, ignoring tuples order
  // }

  insertFactsForNextTick(facts) {
    // console.log({ facts })
    this.upcomingTickFacts = mergeDeep(this.upcomingTickFacts, facts);
    // console.log(this.upcomingTickFacts);
  }

  // this call computes all deductive facts (classic Datalog)
  // doesn't support negation for now
  deductFacts() {
    let accumulatedFacts = new Map();
    let newTuplesCount = 0;

    do {
      const currentFacts = mergeDeep(this.upcomingTickFacts, accumulatedFacts);
      const newFacts = produceFactsUsingDeductiveRules(this.timestamp+1, this.rules, currentFacts);
      // console.log(this.upcomingTickFacts);
      accumulatedFacts = mergeDeep(accumulatedFacts, newFacts);
      newTuplesCount = _.sum([...newFacts.values()].map(tuples => tuples.length));
      // debugger
    } while (newTuplesCount > 0);
    return mergeDeep(this.upcomingTickFacts, accumulatedFacts);
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