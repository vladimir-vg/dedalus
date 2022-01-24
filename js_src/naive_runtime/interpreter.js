import _ from 'lodash';

import { mergeFactsDeep, collectListFromFacts } from '../ast.js';
import { Table } from './table.js';



const collectExprArgs = (astFacts, exprId) => {
  const keep = (row) => _.isEqual(row[0], exprId);
  const getPairSimpleValue = ([id, index, value]) => [index, value];
  const params = collectListFromFacts(astFacts, {
    'ast_body_var_arg/4': {
      keep,
      getPair: ([id, index, name, locPrefix]) =>
        [index, { variable: name['symbol'] }]
    },
    'ast_body_int_arg/3': { keep, getPair: getPairSimpleValue },
    'ast_body_str_arg/3': { keep, getPair: getPairSimpleValue },
    'ast_body_sym_arg/3': { keep, getPair: getPairSimpleValue },
  });
  return params;
}



const collectBodyFacts = (ast, clauseId) => {
  const items = [];

  (ast.get('ast_body_expr/2') ?? []).forEach(bTuple => {
    const [clauseId1, exprId] = bTuple;
    if (clauseId != clauseId1) { return; }

    const bodyFact = _.find(
        (ast.get('ast_body_atom/3') ?? []),
        (fTuple) => {
          const [exprId2, _name, _n] = fTuple;
          return _.isEqual(exprId, exprId2);
        });
    
    if (!bodyFact) { return; }
    const [_id, name, negated] = bodyFact;
    if (name['symbol'] == 'successor') { return; }

    const params = collectExprArgs(ast, exprId);
    const key = `${name['symbol']}/${params.length}`;

    const isNegated = (negated['symbol'] == 'true');
    items.push({ key, params, isNegated });
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

    const params = collectExprArgs(ast, exprId);
    items.push([params[0], op['symbol'], params[1]]);
  });

  // successor atom acts as condition
  (ast.get('ast_body_atom/3') ?? []).forEach(tuple => {
    const [exprId, name, negated] = tuple;
    if (name['symbol'] !== 'successor') { return; }
    const doesBelongToClause = ast.get('ast_body_expr/2')
      .some(tuple => _.isEqual(tuple, [clauseId, exprId]));
    if (!doesBelongToClause) { return; }

    const isNegated = (negated['symbol'] == 'true');
    const params = collectExprArgs(ast, exprId);
    // number of args must be checked by validator
    const op = isNegated ? 'succ-neg' : 'succ';
    if (!params[1]) debugger
    items.push([params[0], op, params[1]]);
  });

  return items;
};

const prepareDeductiveClauses = (ast) => {
  const clauses = [];
  (ast.get('ast_clause/3') ?? []).forEach(cTuple => {
    const [name, clauseId, suffix] = cTuple;
    // we are interested only in deductive rules
    if (!_.isEqual(suffix, {symbol: 'none'})) { return; }

    const keep = (row) => _.isEqual(row[0], clauseId);
    const getPairSimpleValue = ([id, index, value]) => [index, value];
    const params = collectListFromFacts(ast, {
      'ast_clause_var_arg/5': {
        keep,
        getPair: ([id, index, name, aggFunc, locPrefix]) =>
          [index, { variable: name['symbol'], aggFunc: aggFunc['symbol'] }],
      },
      'ast_clause_int_arg/3': { keep, getPair: getPairSimpleValue },
      'ast_clause_str_arg/3': { keep, getPair: getPairSimpleValue },
      'ast_clause_sym_arg/3': { keep, getPair: getPairSimpleValue },
    });

    const key = `${name['symbol']}/${params.length}`;

    const bodyFacts = collectBodyFacts(ast, clauseId);
    const bodyConditions = collectBodyConditions(ast, clauseId);

    clauses.push({ key, params, bodyFacts, bodyConditions });
  });
  return clauses;
};



const produceFactsUsingDeductiveRules = (clauses, facts) => {
  // Just walk all inductive rules (not @async and not @next)
  // one by one and produce all possible new facts from given facts

  return clauses.reduce((newFacts, clause) => {
    const { key, params, bodyFacts, bodyConditions } = clause;
    const positiveBodyFacts = bodyFacts.filter(({ isNegated }) => !isNegated);
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
      const clauses = prepareDeductiveClauses(rules);
  
      do {
        const newFacts = produceFactsUsingDeductiveRules(clauses, accumulatedFacts);
        accumulatedFacts = mergeFactsDeep(accumulatedFacts, newFacts);
        newTuplesCount = _.sum([...newFacts.values()].map(tuples => tuples.length));
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