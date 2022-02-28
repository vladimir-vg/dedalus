import _ from 'lodash';
import seedrandom from 'seedrandom';


// timestamp that we assign to all AST facts
const AST_TIMESTAMP = -100;



const isString = (val) => (typeof val === 'object') && ('string' in val);
const isInteger = (val) => typeof val === 'number';
// TODO: rename Atom to Symbol
// seems like in Datalog community atoms are not same as symbols
// better to rename to avoid confusion
const isSymbol = (val) => {
  return (typeof val === 'object') && ('symbol' in val);
};
const isVariable = (val) => {
  return (typeof val === 'object') && (val !== null) && ('Variable' in val);
};

const argToSymbol = (arg) => ({ symbol: arg['symbol'] ?? arg['Variable']['name'] });

const boolToSymbol = (val) => {
  if (val === null) { return {symbol: 'none'}; }
  else if (val) { return {symbol: 'true'}; }
  else { return {symbol: 'false'}; }
};


const mergeTFactsDeep = (tFacts1, tFacts2) => {
  const toAdd = [];
  [...tFacts2].forEach(([t, newMap]) => {
    const oldMap = tFacts1.get(t) ?? (new Map());
    toAdd.push([t, mergeFactsDeep(oldMap, newMap)]);
  });
  return (new Map([...tFacts1, ...toAdd]));
};

const mergeFactsDeep = (facts, addition) => {
  const toAdd = [];

  let entries;
  if (addition instanceof Map) {
    entries = [...addition.entries()];
  } else {
    entries = Object.entries(addition);
  }

  entries.forEach(([key, newTuples]) => {
    const oldTuples = facts.get(key) ?? [];
    const tuples = [...oldTuples, ...newTuples];
    const uniqueTuples = _.uniqWith(tuples, _.isEqual);
    toAdd.push([key, uniqueTuples]);
  });
  const newFacts = new Map([...facts, ...toAdd]);

  return newFacts;
};



const transformAtom = (tables, item, gensym, filename) => {
  const { line, name, time, args } = item['Atom'];
  const atomId = {symbol: gensym('a')};
  
  const intArgs = [];
  const symArgs = [];
  const strArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [atomId, argN+1, arg];
    if (isSymbol(arg)) { symArgs.push([atomId, argN+1, argToSymbol(arg)]); }
    else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeFactsDeep(tables, {
    'ast_atom_location': [
      [filename, line, atomId]
    ],
    'ast_atom': [
      [{symbol: name}, atomId, time]
    ],
    'ast_atom_int_arg': intArgs,
    'ast_atom_sym_arg': symArgs,
    'ast_atom_str_arg': strArgs,
  });
};



const transformBodyAtomExpr = (tables, bodyExpr, clauseId, gensym, filename) => {
  const exprId = {symbol: gensym('b')};
  const { negated, name, args, time, line } = bodyExpr['BodyAtomExpr'];
  const intTime = [];
  const varTime = [];
  if (isVariable(time)) {
    varTime.push([exprId, argToSymbol(time)]);
  } else if (isInteger(time)) {
    intTime.push([exprId, time]);
  }

  const varArgs = [];
  const intArgs = [];
  const strArgs = [];
  const symArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [exprId, argN+1, arg];
    if (isSymbol(arg)) {
      symArgs.push([exprId, argN+1, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { Variable: { location } } = arg;
      varArgs.push([
        exprId, argN+1, argToSymbol(arg), boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeFactsDeep(tables, {
    'ast_body_expr_location': [
      [filename, line, exprId]
    ],
    'ast_body_expr': [
      [clauseId, exprId]
    ],
    'ast_body_atom': [
      [exprId, argToSymbol(name), boolToSymbol(negated)]
    ],
    'ast_body_atom_var_time': varTime,
    'ast_body_atom_int_time': intTime,
    'ast_body_var_arg': varArgs,
    'ast_body_int_arg': intArgs,
    'ast_body_sym_arg': symArgs,
    'ast_body_str_arg': strArgs,
  });
};



const transformBinaryPredicateExpr = (tables, bodyExpr, clauseId, gensym, filename) => {
  const { left, right, op, line } = bodyExpr['BinaryPredicateExpr'];
  const exprId = {symbol: gensym('b')};

  const varArgs = [];
  const intArgs = [];
  [left, right].forEach((arg, argN) => {
    const tuple = [exprId, argN+1, arg];
    if (isVariable(arg)) {
      const { location } = arg;
      varArgs.push([
        exprId, argN+1, argToSymbol(arg), boolToSymbol(location)
      ]);
    }
    else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isSymbol(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { intArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeFactsDeep(tables, {
    'ast_body_expr_location': [
      [filename, line, exprId]
    ],
    'ast_body_expr': [
      [clauseId, exprId]
    ],
    'ast_body_binop': [
      [exprId, {symbol: op}]
    ],
    'ast_body_var_arg': varArgs,
    'ast_body_int_arg': intArgs,
  });
};



const transformChooseExpr = (tables, bodyExpr, clauseId, gensym, filename) => {
  const { line, keyvars, rowvars } = bodyExpr['ChooseExpr'];
  const exprId = {symbol: gensym('b')};

  const varToTuple = (arg, argN) =>
    [exprId, argN+1, argToSymbol(arg)];
  const keyVars = keyvars.map(varToTuple);
  const rowVars = rowvars.map(varToTuple);

  return mergeFactsDeep(tables, {
    'ast_body_expr_location': [
      [filename, line, exprId]
    ],
    'ast_body_expr': [
      [clauseId, exprId]
    ],
    'ast_body_choose': [[exprId]],
    'ast_body_choose_key_var': keyVars,
    'ast_body_choose_row_var': rowVars,
  });
};



const transformBodyExpr = (tables, bodyExpr, clauseId, gensym, filename) => {
  if ('BodyAtomExpr' in bodyExpr) {
    return transformBodyAtomExpr(tables, bodyExpr, clauseId, gensym, filename);
  } else if ('BinaryPredicateExpr' in bodyExpr) {
    return transformBinaryPredicateExpr(tables, bodyExpr, clauseId, gensym, filename);
  } else if ('ChooseExpr' in bodyExpr) {
    return transformChooseExpr(tables, bodyExpr, clauseId, gensym, filename);
  }

  throw new Error(`Unknown body rule item: ${JSON.stringify(bodyExpr)}`);
};



const transformRule = (tables, item, gensym, filename) => {
  const { line, name, args, body, suffix } = item['Rule'];
  const clauseId = {symbol: gensym('c')};

  const varArgs = [];
  const intArgs = [];
  const strArgs = [];
  const symArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [clauseId, argN+1, arg];
    if (isSymbol(arg)) {
      symArgs.push([clauseId, argN+1, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { Variable: { location, afunc } } = arg;
      const afunc1 = {symbol: (afunc ?? 'none')};
      varArgs.push([
        clauseId, argN+1, argToSymbol(arg),
        afunc1, boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  const tables1 = body.reduce((tables, bodyExpr) => {
    return transformBodyExpr(tables, bodyExpr, clauseId, gensym, filename)
  }, tables);

  const suffix1 = {symbol: suffix ?? 'none'};
  return mergeFactsDeep(tables1, {
    'ast_clause_location': [
      [filename, line, clauseId]
    ],
    'ast_clause': [
      [{symbol: name}, clauseId, suffix1]
    ],
    'ast_clause_var_arg': varArgs,
    'ast_clause_int_arg': intArgs,
    'ast_clause_str_arg': strArgs,
    'ast_clause_sym_arg': symArgs,
  });
};



const transformItem = (tables, item, gensym, filename) => {
  if (item['Atom']) {
    return transformAtom(tables, item, gensym, filename);
  } else if (item['Rule']) {
    return transformRule(tables, item, gensym, filename);
  }

  throw new Error(`Unknown type of item: ${item}`);
  // return tables;
};



const makeGensymFunc = (filename) => {
  const rand = seedrandom(filename);
  return (prefix) => {
    const randomId = rand().toString(36).substring(2,10);
    return `${prefix}_${randomId}`;
  };
};

// produce sets of tuples for each rule
const tree2facts = (tree, filename) => {
  const filenameStr = {string: filename};

  // we use random generator for symbol generation
  // for ClauseId and AtomId values.
  // It is better to have reproducible results,
  // that's why we use random with seed
  const gensym = makeGensymFunc(filename);

  const tables = tree.reduce((tables, item) =>
    transformItem(tables, item, gensym, filenameStr), new Map());

  // let's remove empty tables to make it easier to look at the ast
  const tables1 = new Map([...tables].filter(
    ([key, value]) => value.length !== 0));

  return new Map([[AST_TIMESTAMP, tables1]]);
};



const sourceFactsFromAstFacts = (astTFacts) => {
  // we need to walk following facts
  // and assemble facts that they are describing:
  //
  // ast_atom/3
  // ast_atom_sym_arg/3
  // ast_atom_int_arg/3
  // ast_atom_str_arg/3

  const astFacts = astTFacts.get(AST_TIMESTAMP);

  const output = new Map();
  (astFacts.get('ast_atom') ?? [])
    .forEach(fTuple => {
      const [name, atomId, sourceTimestamp] = fTuple;

      const facts = (output.get(sourceTimestamp) ?? (new Map()));
      output.set(sourceTimestamp, facts);

      // now let's find all arguments and insert them into array
      const resultTuple = []; // first element is timestamp

      const argNames = ['ast_atom_sym_arg', 'ast_atom_int_arg', 'ast_atom_str_arg'];
      argNames.forEach(name => {
        (astFacts.get(name) ?? [])
          .filter(([atomId1, n, val]) => (_.isEqual(atomId1, atomId)))
          .forEach(aTuple => {
            const [_atomId, n, val] = aTuple;
            resultTuple[n-1] = val;
          });
      });

      // just to make sure that there weren't any gaps in arguments entries.
      for (let i=0; i<resultTuple.length; i++) {
        if (resultTuple[i] === undefined) {
          console.log({ resultTuple })
          throw new Error(`got empty value at ${i} for ${atomId['symbol']} atom, '${name['symbol']}' rule`);
        }
      }

      // at this point, we collected all values into resultTuple.
      // const key = `${name.symbol}/${resultTuple.length}`;
      const key = name.symbol;
      const currentTuples = (facts.get(key) ?? []);
      currentTuples.push(resultTuple);
      facts.set(key, currentTuples);
    });

  return output;
};



const rulesFromAstFacts = (astTFacts) => {
  const astFacts = astTFacts.get(AST_TIMESTAMP);
  const rulesFacts = new Map([...astFacts].filter(([key, _tuples]) => {
    switch (key) {
      case 'ast_atom':
      case 'ast_atom_sym_arg':
      case 'ast_atom_int_arg':
      case 'ast_atom_str_arg':
        return false;
      default:
        return true;
    }
  }));
  return rulesFacts;
};



const extractMetadata = (astTFacts0) => {
  // all facts and rules prefixed with '$meta' carry
  // some metainformation about the code
  //
  // These facts and rules should not be accessible from
  // other rules. That's why we extract them here.

  const astFacts = new Map(
    [...astTFacts0.get(AST_TIMESTAMP)].map(([key, tuples]) => {
      switch (key) {
        case 'ast_atom':
          {
            const filteredTuples = tuples.filter(
              ([name, id, timestamp]) => 
              !name['symbol'].startsWith('$meta '));
            return [key, filteredTuples];
          }
            
        case 'ast_clause':
          {
            const filteredTuples = tuples.filter(
              ([name, id, suffix]) => 
                !name['symbol'].startsWith('$meta '));
            return [key, filteredTuples];
          }

        default: return [key, tuples];
      }
    }));

  const astTFacts = new Map([[AST_TIMESTAMP, astFacts]]);
  
  let explicitStrata = null;

  const META_INFO_TIMESTAMP = 0;
  const facts = sourceFactsFromAstFacts(astTFacts0).get(META_INFO_TIMESTAMP) ?? (new Map());

  if (facts.get('$meta stratum')) {
    const vertices0 = _.groupBy(
      (facts.get('$meta stratum') ?? []).map(([s, r]) => [s['symbol'], r['symbol']]),
      ([stratum, rule]) => stratum);
    const vertices = _.mapValues(
      vertices0,
      (items) => items.map(([st, rule]) => rule));
    const edges = (facts.get('$meta stratum_dependency') ?? [])
      .map(([s1, s2]) => [s1['symbol'], s2['symbol']]);
    explicitStrata = { vertices, edges };
  }
  return { explicitStrata, astTFacts };
};



const collectListFromFacts = (astFacts, selectors) => {
  // selectors = { [key]: { keep, getPair }, ... }

  const pairs = Object.keys(selectors).flatMap(key => {
    const { keep, getPair } = selectors[key];
    return (astFacts.get(key) ?? []).filter(keep).map(getPair);
  });

  const sortedPairs = _.sortBy(pairs, ([index, _val]) => index);

  if (sortedPairs.length === 0) {
    return [];
  }

  const expectedIndexes = _.range(1, sortedPairs.length+1);
  const [collectedIndexes, values] = _.unzip(sortedPairs);
  if (!_.isEqual(expectedIndexes, collectedIndexes)) {
    throw new Error(`Incorrect args indexes: ${JSON.stringify(collectedIndexes)}`);
  }

  return values;
}




export {
  mergeTFactsDeep,
  mergeFactsDeep,
  tree2facts,
  sourceFactsFromAstFacts,
  rulesFromAstFacts,
  extractMetadata,
  collectListFromFacts,
}