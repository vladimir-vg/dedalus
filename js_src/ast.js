// import { Map } from 'immutable';

// import { get } from "immutable";

import _ from 'lodash';
import equal from 'fast-deep-equal';


// timestamp that we assign to all AST facts
const AST_TIMESTAMP = 0;



const isString = (val) => typeof val === 'string';
const isInteger = (val) => typeof val === 'number';
// TODO: rename Atom to Symbol
// seems like in Datalog community atoms are not same as symbols
// better to rename to avoid confusion
const isSymbol = (val) => {
  return (typeof val === 'object') && ('Atom' in val);
};
const isVariable = (val) => {
  return (typeof val === 'object') && (val !== null) && ('Variable' in val);
};

const argToSymbol = (arg) => ({ symbol: arg['Atom'] ?? arg['Variable']['name'] });

const boolToSymbol = (val) => {
  if (val === null) { return {symbol: 'none'}; }
  else if (val) { return {symbol: 'true'}; }
  else { return {symbol: 'false'}; }
};




const mergeDeep = (ast1, ast2) => {
  const toAdd = [];
  Object.keys(ast2).forEach((key) => {
    const oldTuples = ast1.get(key) ?? [];
    const newTuples = [...oldTuples, ...ast2[key]];
    const uniqueTuples = _.uniqWith(newTuples, equal);
    toAdd.push([key, uniqueTuples]);
  });
  return new Map([...ast1, ...toAdd]);
};




const transformFact = (tables, item, factN, filename) => {
  const { line, name, time, args } = item['Fact'];

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
    'ast_fact/5': [
      [AST_TIMESTAMP, filename, line, {symbol: name}, factN, time]
    ],
    'ast_fact_int_arg/3': intArgs,
    'ast_fact_sym_arg/3': symArgs,
    'ast_fact_str_arg/3': strArgs,
  });
};



const transformFactCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { negated, name, args, time, line } = bodyRule['FactCondition'];
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
    'ast_body_fact/4': [
      [AST_TIMESTAMP, clauseN, ruleN, argToSymbol(name), boolToSymbol(negated)]
    ],
    'ast_body_fact_var_time/3': varTime,
    'ast_body_fact_int_time/3': intTime,
    'ast_body_var_arg/5': varArgs,
    'ast_body_int_arg/4': intArgs,
    'ast_body_sym_arg/4': symArgs,
    'ast_body_str_arg/4': strArgs,
  });
};



const transformOperatorCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { left, right, op, line } = bodyRule['OperatorCondition'];

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
    } else if (isInteger(arg)) { intArgs.push(tuple); }
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
  if ('FactCondition' in bodyRule) {
    return transformFactCondition(tables, bodyRule, clauseN, ruleN, filename);
  } else if ('OperatorCondition' in bodyRule) {
    return transformOperatorCondition(tables, bodyRule, clauseN, ruleN, filename);
  } else if ('ChooseCondition' in bodyRule) {
    return transformChooseCondition(tables, bodyRule, clauseN, ruleN, filename);
  }

  throw new Error(`Unknown body rule item: ${bodyRule}`);
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
  if (item['Fact']) {
    return transformFact(tables, item, index, filename);
  } else if (item['Rule']) {
    return transformRule(tables, item, index, filename);
  }

  throw new Error(`Unknown type of item: ${item}`);
  // return tables;
};



// produce sets of tuples for each rule
const tree2tables = (tree, filename) => {
  const tables = tree.reduce((tables, item, i) =>
    transformItem(tables, item, i, filename), new Map());

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
  // ast_fact/5
  // ast_fact_sym_arg/3
  // ast_fact_int_arg/3
  // ast_fact_str_arg/3

  const output = {};
  ast.get('ast_fact/5')
    .filter(fTuple => fTuple[0] == timestamp)
    .forEach(fTuple => {
      const [_timestamp, _fname, _line, name, factN, sourceTimestamp] = fTuple;

      // now let's find all arguments and insert them into array
      const resultTuple = [sourceTimestamp]; // first element is timestamp

      const argNames = ['ast_fact_sym_arg/3', 'ast_fact_int_arg/3', 'ast_fact_str_arg/3'];
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
      case 'ast_fact/5':
      case 'ast_clause/5':
      case 'ast_body_rule/4':
        return [key, tuples.map(clearLineNumber)];
      default:
        return [key, tuples];
    }
  }));
};



export {
  tree2tables,
  factsFromAst,
  clearLineNumbersFromAst
}