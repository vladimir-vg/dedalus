import _ from 'lodash';


// timestamp that we assign to all AST facts
const AST_TIMESTAMP = 0;



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



const mergeDeep = (facts, addition) => {
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
  // console.log({ newFacts });
  return newFacts;
};



const transformAtom = (tables, item, factN, filename) => {
  const { line, name, time, args } = item['Atom'];

  const intArgs = [];
  const symArgs = [];
  const strArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [AST_TIMESTAMP, factN, argN, arg];
    if (isSymbol(arg)) { symArgs.push([AST_TIMESTAMP, factN, argN, argToSymbol(arg)]); }
    else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeDeep(tables, {
    'ast_atom/5': [
      [AST_TIMESTAMP, filename, line, {symbol: name}, factN, time]
    ],
    'ast_atom_int_arg/3': intArgs,
    'ast_atom_sym_arg/3': symArgs,
    'ast_atom_str_arg/3': strArgs,
  });
};



const transformAtomCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { negated, name, args, time, line } = bodyRule['AtomCondition'];
  const intTime = [];
  const varTime = [];
  if (isVariable(time)) {
    varTime.push([AST_TIMESTAMP, clauseN, ruleN, argToSymbol(time)]);
  } else if (isInteger(time)) {
    intTime.push([AST_TIMESTAMP, clauseN, ruleN, time]);
  }

  const varArgs = [];
  const intArgs = [];
  const strArgs = [];
  const symArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [AST_TIMESTAMP, clauseN, ruleN, argN, arg];
    if (isSymbol(arg)) {
      symArgs.push([AST_TIMESTAMP, clauseN, ruleN, argN, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { Variable: { location } } = arg;
      varArgs.push([
        AST_TIMESTAMP,
        clauseN, ruleN, argN, argToSymbol(arg), boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeDeep(tables, {
    'ast_body_rule/4': [
      [AST_TIMESTAMP, filename, line, clauseN, ruleN]
    ],
    'ast_body_atom/4': [
      [AST_TIMESTAMP, clauseN, ruleN, argToSymbol(name), boolToSymbol(negated)]
    ],
    'ast_body_atom_var_time/3': varTime,
    'ast_body_atom_int_time/3': intTime,
    'ast_body_var_arg/5': varArgs,
    'ast_body_int_arg/4': intArgs,
    'ast_body_sym_arg/4': symArgs,
    'ast_body_str_arg/4': strArgs,
  });
};



const transformBinaryPredicateCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { left, right, op, line } = bodyRule['BinaryPredicateCondition'];

  const varArgs = [];
  const intArgs = [];
  [left, right].forEach((arg, argN) => {
    const tuple = [AST_TIMESTAMP, clauseN, ruleN, argN, arg];
    if (isVariable(arg)) {
      const { location } = arg;
      varArgs.push([
        AST_TIMESTAMP,
        clauseN, ruleN, argN, argToSymbol(arg), boolToSymbol(location)
      ]);
    }
    else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isSymbol(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { intArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeDeep(tables, {
    'ast_body_rule/4': [
      [AST_TIMESTAMP, filename, line, clauseN, ruleN]
    ],
    'ast_body_binop/3': [
      [AST_TIMESTAMP, clauseN, ruleN, {symbol: op}]
    ],
    'ast_body_var_arg/5': varArgs,
    'ast_body_int_arg/4': intArgs,
  });
};



const transformChooseCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { line, keyvars, rowvars } = bodyRule['ChooseCondition'];

  const varToTuple = (arg, argN) =>
    [AST_TIMESTAMP, clauseN, ruleN, argN, argToSymbol(arg)];
  const keyVars = keyvars.map(varToTuple);
  const rowVars = rowvars.map(varToTuple);

  return mergeDeep(tables, {
    'ast_body_rule/4': [
      [AST_TIMESTAMP, filename, line, clauseN, ruleN]
    ],
    'ast_body_choose/2': [[AST_TIMESTAMP, clauseN, ruleN]],
    'ast_body_choose_key_var/4': keyVars,
    'ast_body_choose_row_var/4': rowVars,
  });
};



const transformBodyRule = (tables, bodyRule, clauseN, ruleN, filename) => {
  if ('AtomCondition' in bodyRule) {
    return transformAtomCondition(tables, bodyRule, clauseN, ruleN, filename);
  } else if ('BinaryPredicateCondition' in bodyRule) {
    return transformBinaryPredicateCondition(tables, bodyRule, clauseN, ruleN, filename);
  } else if ('ChooseCondition' in bodyRule) {
    return transformChooseCondition(tables, bodyRule, clauseN, ruleN, filename);
  }

  throw new Error(`Unknown body rule item: ${JSON.stringify(bodyRule)}`);
};



const transformRule = (tables, item, clauseN, filename) => {
  const { line, name, args, body, suffix } = item['Rule'];

  const varArgs = [];
  const intArgs = [];
  const strArgs = [];
  const symArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [AST_TIMESTAMP, clauseN, argN, arg];
    if (isSymbol(arg)) {
      symArgs.push([AST_TIMESTAMP, clauseN, argN, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { Variable: { location, afunc } } = arg;
      const afunc1 = {symbol: (afunc ?? 'none')};
      varArgs.push([
        AST_TIMESTAMP,
        clauseN, argN, argToSymbol(arg),
        afunc1, boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  const tables1 = body.reduce((tables, bodyRule, ruleN) => { 
    return transformBodyRule(tables, bodyRule, clauseN, ruleN, filename)
  }, tables);

  const suffix1 = {symbol: suffix ?? 'none'};
  return mergeDeep(tables1, {
    'ast_clause/5': [
      [AST_TIMESTAMP, filename, line, {symbol: name}, clauseN, suffix1]
    ],
    'ast_clause_var_arg/5': varArgs,
    'ast_clause_int_arg/3': intArgs,
    'ast_clause_str_arg/3': strArgs,
    'ast_clause_sym_arg/3': symArgs,
  });
};



const transformItem = (tables, item, index, filename) => {
  if (item['Atom']) {
    return transformAtom(tables, item, index, filename);
  } else if (item['Rule']) {
    return transformRule(tables, item, index, filename);
  }

  throw new Error(`Unknown type of item: ${item}`);
  // return tables;
};



// produce sets of tuples for each rule
const tree2tables = (tree, filename) => {
  const filenameStr = {string: filename};
  const tables = tree.reduce((tables, item, i) =>
    transformItem(tables, item, i, filenameStr), new Map());

  // let's remove empty tables to make it easier to look at the ast
  const tables1 = new Map([...tables].filter(
    ([key, value]) => value.length !== 0));

  return tables1;
};



// interprets ast, returns tables of facts
// that were specified in the source for given timestamp
const factsFromAst = (ast, timestamp) => {
  // we need to walk following facts
  // and assemble facts that they are describing:
  //
  // ast_atom/5
  // ast_atom_sym_arg/3
  // ast_atom_int_arg/3
  // ast_atom_str_arg/3

  // console.log({ ast })

  const output = {};
  (ast.get('ast_atom/5') ?? [])
    .filter(fTuple => fTuple[0] == timestamp)
    .forEach(fTuple => {
      const [_timestamp, _fname, _line, name, factN, sourceTimestamp] = fTuple;

      // now let's find all arguments and insert them into array
      const resultTuple = [sourceTimestamp]; // first element is timestamp

      const argNames = ['ast_atom_sym_arg/3', 'ast_atom_int_arg/3', 'ast_atom_str_arg/3'];
      argNames.forEach(name => {
        ast.get(name)
          .filter(([t, factN1, n, val]) =>
            (t == timestamp) && (factN1 == factN))
          .forEach(aTuple => {
            const [_t, _factN, n, val] = aTuple;
            resultTuple[n+1] = val;
          });
      });

      // just to make sure that there weren't any gaps in arguments entries.
      for (let i=0; i<resultTuple.length; i++) {
        if (resultTuple[i] === undefined) {
          throw new Error(`got empty value at ${i} for ${factN}th ${name}`);
        }
      }

      // at this point, we collected all values into resultTuple.
      const key = `${name.symbol}/${resultTuple.length-1}`;
      output[key] = (output[key] ?? []);
      output[key].push(resultTuple);
    });

  return mergeDeep(new Map(), output);
}



// sets all information about line numbers and file source paths
// for easier comparison in test
const clearLineNumbersFromAst = (ast) => {
  const clearLineNumber = (tuple) => {
    const [t, filename, _line, ...rest] = tuple;
    const tuple1 = [t, filename, 0, ...rest];
    return tuple1;
  };
  return new Map([...ast].map(([key, tuples]) => {
    switch (key) {
      case 'ast_atom/5':
      case 'ast_clause/5':
      case 'ast_body_rule/4':
        return [key, tuples.map(clearLineNumber)];
      default:
        return [key, tuples];
    }
  }));
};



const getMinimalTimestamp = (ast) => {
  const timestamps = (ast.get('ast_atom/5') ?? []).map(tuple => tuple[0]);
  return timestamps.reduce(Math.min, 0);
};

const rulesFromAst = (ast) => {
  return new Map([...ast].filter(([key, tuples]) => {
    switch (key) {
      case 'ast_atom/5':
      case 'ast_atom_sym_arg/3':
      case 'ast_atom_int_arg/3':
      case 'ast_atom_str_arg/3':
        return false;
      default:
        return true;
    }
  }));
};



export {
  mergeDeep,
  tree2tables,
  factsFromAst,
  clearLineNumbersFromAst,
  getMinimalTimestamp,
  rulesFromAst,
}