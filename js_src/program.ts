import _ from 'lodash';

import { Program, Clause } from './runtime';

import { collectListFromFacts } from './ast';



const collectExprArgs = (astFacts, exprId) => {
  const keep = (row) => _.isEqual(row[0], exprId);
  const getPairSimpleValue = ([id, index, value]) => [index, value];
  const params = collectListFromFacts(astFacts, {
    'ast_body_var_arg': {
      keep,
      getPair: ([_id, index, name, _locPrefix, _ignored]) =>
        [index, { variable: name['symbol'] }]
    },
    'ast_body_int_arg': { keep, getPair: getPairSimpleValue },
    'ast_body_str_arg': { keep, getPair: getPairSimpleValue },
    'ast_body_sym_arg': { keep, getPair: getPairSimpleValue },
  });
  return params;
}



const collectBodyFacts = (ast, clauseId) => {
  const items = [];

  (ast.get('ast_body_expr') ?? []).forEach(bTuple => {
    const [clauseId1, exprId] = bTuple;
    if (clauseId != clauseId1) { return; }

    const bodyFact = _.find(
        (ast.get('ast_body_atom') ?? []),
        (fTuple) => {
          const [exprId2, _name, _n] = fTuple;
          return _.isEqual(exprId, exprId2);
        });
    
    if (!bodyFact) { return; }
    const [_id, name, negated] = bodyFact;
    if (name['symbol'] == 'successor') { return; }

    const params = collectExprArgs(ast, exprId);
    // const key = `${name['symbol']}/${params.length}`;
    const key = name['symbol']

    const isNegated = (negated['symbol'] == 'true');
    items.push({ key, params, isNegated });
  });

  return items;
};

const collectBodyConditions = (ast, clauseId) => {
  const items = [];
  (ast.get('ast_body_binop') ?? []).forEach(tuple => {
    const [exprId, op] = tuple;
    const doesBelongToClause = ast.get('ast_body_expr')
      .some(tuple => _.isEqual(tuple, [clauseId, exprId]));
    if (!doesBelongToClause) { return; }

    const params = collectExprArgs(ast, exprId);
    items.push([params[0], op['symbol'], params[1]]);
  });

  // successor atom acts as condition
  (ast.get('ast_body_atom') ?? []).forEach(tuple => {
    const [exprId, name, negated] = tuple;
    if (name['symbol'] !== 'successor') { return; }
    const doesBelongToClause = ast.get('ast_body_expr')
      .some(tuple => _.isEqual(tuple, [clauseId, exprId]));
    if (!doesBelongToClause) { return; }

    const isNegated = (negated['symbol'] == 'true');
    const params = collectExprArgs(ast, exprId);
    // number of args must be checked by validator
    const op = isNegated ? 'succ-neg' : 'succ';
    // if (!params[1]) debugger
    items.push([params[0], op, params[1]]);
  });

  return items;
};

const collectChooseExprs = (ast, clauseId) => {
  const items = [];
  (ast.get('ast_body_choose') ?? []).forEach(tuple => {
    const [exprId] = tuple;
    const doesBelongToClause = ast.get('ast_body_expr')
      .some(tuple => _.isEqual(tuple, [clauseId, exprId]));
    if (!doesBelongToClause) { return; }

    const keep = (row) => _.isEqual(row[0], exprId);
    const getPair = ([id, index, value]) => [index, value['symbol']];
    const keyVars = collectListFromFacts(ast, {
      'ast_body_choose_key_var': { keep, getPair }
    });
    const rowVars = collectListFromFacts(ast, {
      'ast_body_choose_row_var': { keep, getPair }
    });

    items.push({ keyVars, rowVars });
  });

  return items;
};

const prepareClauses = (ast, suffix): Clause[] => {
  const clauses = [];
  (ast.get('ast_clause') ?? []).forEach(cTuple => {
    const [name, clauseId, suffix1] = cTuple;
    if (!_.isEqual(suffix1, suffix)) { return; }

    const keep = (row) => _.isEqual(row[0], clauseId);
    const getPairSimpleValue = ([id, index, value]) => [index, value];

    const params = collectListFromFacts(ast, {
      'ast_clause_var_arg': {
        keep,
        getPair: ([id, index, name, aggFunc, locPrefix]) =>
          [index, { variable: name['symbol'], aggFunc: aggFunc['symbol'] }],
      },
      'ast_clause_int_arg': { keep, getPair: getPairSimpleValue },
      'ast_clause_str_arg': { keep, getPair: getPairSimpleValue },
      'ast_clause_sym_arg': { keep, getPair: getPairSimpleValue },
    });

    const key = name['symbol'];
    const bodyFacts = collectBodyFacts(ast, clauseId);
    const bodyConditions = collectBodyConditions(ast, clauseId);
    const chooseExprs = collectChooseExprs(ast, clauseId);
    clauses.push({ key, params, bodyFacts, bodyConditions, chooseExprs });
  });
  return clauses;
};



const ast2program = (ast): Program => {
  return {
    deductive: prepareClauses(ast, {symbol: 'none'}),
    inductive: prepareClauses(ast, {symbol: '@next'}),
    asynchronous: prepareClauses(ast, {symbol: '@async'}),
  };
};



export {
  ast2program,
}