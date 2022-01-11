import _ from 'lodash';


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


const mergeFactsDeep = (facts1, facts2) => {
  const toAdd = [];
  [...facts2].forEach(([t, newMap]) => {
    const oldMap = facts1.get(t) ?? (new Map());
    toAdd.push([t, mergeTupleMapDeep(oldMap, newMap)]);
  });
  return (new Map([...facts1, ...toAdd]));
};

const mergeTupleMapDeep = (facts, addition) => {
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



const transformAtom = (tables, item, atomN, filename) => {
  const { line, name, time, args } = item['Atom'];

  const intArgs = [];
  const symArgs = [];
  const strArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [atomN, argN, arg];
    if (isSymbol(arg)) { symArgs.push([atomN, argN, argToSymbol(arg)]); }
    else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeTupleMapDeep(tables, {
    'ast_atom/5': [
      [filename, line, {symbol: name}, atomN, time]
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
    varTime.push([clauseN, ruleN, argToSymbol(time)]);
  } else if (isInteger(time)) {
    intTime.push([clauseN, ruleN, time]);
  }

  const varArgs = [];
  const intArgs = [];
  const strArgs = [];
  const symArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [clauseN, ruleN, argN, arg];
    if (isSymbol(arg)) {
      symArgs.push([clauseN, ruleN, argN, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { Variable: { location } } = arg;
      varArgs.push([
        clauseN, ruleN, argN, argToSymbol(arg), boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return mergeTupleMapDeep(tables, {
    'ast_body_rule/4': [
      [filename, line, clauseN, ruleN]
    ],
    'ast_body_atom/4': [
      [clauseN, ruleN, argToSymbol(name), boolToSymbol(negated)]
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
    const tuple = [clauseN, ruleN, argN, arg];
    if (isVariable(arg)) {
      const { location } = arg;
      varArgs.push([
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

  return mergeTupleMapDeep(tables, {
    'ast_body_rule/4': [
      [filename, line, clauseN, ruleN]
    ],
    'ast_body_binop/3': [
      [clauseN, ruleN, {symbol: op}]
    ],
    'ast_body_var_arg/5': varArgs,
    'ast_body_int_arg/4': intArgs,
  });
};



const transformChooseCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { line, keyvars, rowvars } = bodyRule['ChooseCondition'];

  const varToTuple = (arg, argN) =>
    [clauseN, ruleN, argN, argToSymbol(arg)];
  const keyVars = keyvars.map(varToTuple);
  const rowVars = rowvars.map(varToTuple);

  return mergeTupleMapDeep(tables, {
    'ast_body_rule/4': [
      [filename, line, clauseN, ruleN]
    ],
    'ast_body_choose/2': [[clauseN, ruleN]],
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
    const tuple = [clauseN, argN, arg];
    if (isSymbol(arg)) {
      symArgs.push([clauseN, argN, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { Variable: { location, afunc } } = arg;
      const afunc1 = {symbol: (afunc ?? 'none')};
      varArgs.push([
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
  return mergeTupleMapDeep(tables1, {
    'ast_clause/5': [
      [filename, line, {symbol: name}, clauseN, suffix1]
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
const tree2facts = (tree, filename) => {
  const filenameStr = {string: filename};
  const tables = tree.reduce((tables, item, i) =>
    transformItem(tables, item, i, filenameStr), new Map());

  // let's remove empty tables to make it easier to look at the ast
  const tables1 = new Map([...tables].filter(
    ([key, value]) => value.length !== 0));

  return new Map([[AST_TIMESTAMP, tables1]]);
};



const sourceFactsFromAstFacts = (astFacts) => {
  // we need to walk following facts
  // and assemble facts that they are describing:
  //
  // ast_atom/5
  // ast_atom_sym_arg/3
  // ast_atom_int_arg/3
  // ast_atom_str_arg/3

  const tuples = astFacts.get(AST_TIMESTAMP);

  const output = new Map();
  (tuples.get('ast_atom/5') ?? [])
    .forEach(fTuple => {
      const [_fname, _line, name, atomN, sourceTimestamp] = fTuple;

      const tuplesMap = (output.get(sourceTimestamp) ?? (new Map()));
      output.set(sourceTimestamp, tuplesMap);

      // now let's find all arguments and insert them into array
      const resultTuple = []; // first element is timestamp

      const argNames = ['ast_atom_sym_arg/3', 'ast_atom_int_arg/3', 'ast_atom_str_arg/3'];
      argNames.forEach(name => {
        (tuples.get(name) ?? [])
          .filter(([atomN1, n, val]) => (atomN1 == atomN))
          .forEach(aTuple => {
            const [_atomN, n, val] = aTuple;
            resultTuple[n] = val;
          });
      });

      // just to make sure that there weren't any gaps in arguments entries.
      for (let i=0; i<resultTuple.length; i++) {
        if (resultTuple[i] === undefined) {
          throw new Error(`got empty value at ${i} for ${atomN}th ${name}`);
        }
      }

      // at this point, we collected all values into resultTuple.
      const key = `${name.symbol}/${resultTuple.length}`;
      const currentTuples = (tuplesMap.get(key) ?? []);
      currentTuples.push(resultTuple);
      tuplesMap.set(key, currentTuples);
    });

  return output;
};



const rulesFromAstFacts = (astFacts) => {
  const tupleMap = astFacts.get(AST_TIMESTAMP);
  const rulesTupleMap = new Map([...tupleMap].filter(([key, _tuples]) => {
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
  return rulesTupleMap;
};



export {
  mergeFactsDeep,
  mergeTupleMapDeep,
  tree2facts,
  sourceFactsFromAstFacts,
  rulesFromAstFacts,
}