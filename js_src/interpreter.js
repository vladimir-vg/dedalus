import _ from 'lodash';

import { mergeTupleMapDeep } from './ast.js';
import { Table } from './table.js';



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

const collectBodyFacts = (ast, clauseId) => {
  const items = [];

  (ast.get('ast_body_expr/2') ?? []).forEach(bTuple => {
    const [clauseId1, exprId] = bTuple;
    if (clauseId != clauseId1) { return; }

    const bodyFact = _.find(
        (ast.get('ast_body_atom/3') ?? []),
        (fTuple) => {
          const [exprId2, _name, _n] = fTuple;
          return (exprId == exprId2);
        });
    
    if (!bodyFact) { return; }
    const [_r1, name, _n] = bodyFact;

    const valueCollector = (key, isVar) => ({
      key,
      keep: (row) => (row[0] == exprId),
      selectValue: (row) => isVar ? row[2]['symbol'] : row[2],
      selectIndex: (row) => row[1],
    });

    const params = collectValuesFromFacts(ast, [
      valueCollector('ast_body_var_arg/4', true),
      valueCollector('ast_body_int_arg/3'),
      valueCollector('ast_body_str_arg/3'),
      valueCollector('ast_body_sym_arg/3'),
    ]);
    const key = `${name['symbol']}/${params.length}`;

    items.push({ key, params });
  });

  return items;
};

const collectBodyConditions = (ast, clauseId) => {
  const items = [];
  (ast.get('ast_body_binop/2') ?? []).forEach(tuple => {
    const [exprId, op] = tuple;
    const doesBelongToClause = ast.get('ast_body_expr/2')
      .some(tuple => _.isEqual(tuple, [clauseId, exprId]));
    if (!doesBelongToClause) { return; }

    const valueCollector = (key, isVar) => ({
      key,
      keep: (row) => (row[0] == exprId),
      selectValue: (row) => isVar ? row[2]['symbol'] : row[2],
      selectIndex: (row) => row[1],
    });

    const params = collectValuesFromFacts(ast, [
      valueCollector('ast_body_var_arg/4', true),
      valueCollector('ast_body_int_arg/3'),
      valueCollector('ast_body_str_arg/3'),
      valueCollector('ast_body_sym_arg/3'),
    ]);

    items.push([params[0], op['symbol'], params[1]]);
  });

  return items;
};

const prepareDeductiveClauses = (ast) => {
  const clauses = [];
  (ast.get('ast_clause/3') ?? []).forEach(cTuple => {
    const [name, clauseId, suffix] = cTuple;
    // we are interested only in deductive rules
    if (!_.isEqual(suffix, {symbol: 'none'})) { return; }

    const valueCollector = (key, isVar) => ({
      key,
      keep: (row) => (row[0] == clauseId),
      selectValue: (row) => isVar ? row[2]['symbol'] : row[2],
      selectIndex: (row) => row[1],
    });

    const params = collectValuesFromFacts(ast, [
      valueCollector('ast_clause_var_arg/5', true),
      valueCollector('ast_clause_int_arg/3'),
      valueCollector('ast_clause_str_arg/3'),
      valueCollector('ast_clause_sym_arg/3'),
    ]);
    const key = `${name['symbol']}/${params.length}`;

    const bodyFacts = collectBodyFacts(ast, clauseId);
    const bodyConditions = collectBodyConditions(ast, clauseId);

    clauses.push({ key, params, bodyFacts, bodyConditions });
  });
  return clauses;
};



const produceFactsUsingDeductiveRules = (astRules, facts) => {
  // Just walk all inductive rules (not @async and not @next)
  // one by one and produce all possible new facts from given facts

  // collect all inductive rules
  // { key, params, bodyFacts: [{ key, params }, ...], bodyConditions: [[a, op, b], ...] }
  // conditions must come after facts in the body
  
  const clauses = prepareDeductiveClauses(astRules);

  return clauses.reduce((newFacts, clause) => {
    const { key, params, bodyFacts, bodyConditions } = clause;
    const tables = bodyFacts.map(({ key, params }) => Table.fromFacts(facts, key, params));
    const table0 = tables.reduce((t1, t2) => t1.join(t2));
    const table1 = table0.select(bodyConditions);

    const rows = table1.projectColumns(params);

    // remove rows that are already present
    // so we would return only new facts
    const newRows = rows.filter(row =>
      !_.find(facts.get(key), row2 => _.isEqual(row, row2)))

    const oldRows = newFacts.get(key) ?? [];
    newFacts.set(key, [...oldRows, ...newRows]);
    return newFacts;
  }, new Map());
};



class Interpreter {
  constructor(initialTimestamp, rules) {
    this.timestamp = initialTimestamp;
    this.rules = rules;

    // facts persisted for current timestamp
    this.prevTickFacts = null;
    this.upcomingTickFacts = new Map();
  }

  // isStale() {
  //   // should return true when we reached fixpoint in computation
  //   // TODO: deep equality check, ignoring tuples order
  // }

  insertFactsForNextTick(facts) {
    // console.log({ facts })
    this.upcomingTickFacts = mergeTupleMapDeep  (this.upcomingTickFacts, facts);
    // console.log(this.upcomingTickFacts);
  }

  // this call computes all deductive facts (classic Datalog)
  // doesn't support negation for now
  deductFacts() {
    let accumulatedFacts = new Map();
    let newTuplesCount = 0;

    do {
      const currentFacts = mergeTupleMapDeep(this.upcomingTickFacts, accumulatedFacts);
      const newFacts = produceFactsUsingDeductiveRules(this.rules, currentFacts);

      accumulatedFacts = mergeTupleMapDeep(accumulatedFacts, newFacts);
      
      newTuplesCount = _.sum([...newFacts.values()].map(tuples => tuples.length));
      // debugger
    } while (newTuplesCount > 0);
    // debugger
    return mergeTupleMapDeep(this.upcomingTickFacts, accumulatedFacts);
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