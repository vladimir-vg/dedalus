import { Map } from 'immutable';



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



const transformFact = (tables, item, factN, filename) => {
  const { line, name, time, args } = item['Fact'];

  const intArgs = [];
  const symArgs = [];
  const strArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [factN, argN, arg];
    if (isSymbol(arg)) { symArgs.push([factN, argN, argToSymbol(arg)]); }
    else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return tables.mergeDeep({
    'fact/5': [
      [filename, line, name, factN, time]
    ],
    'fact_int_arg/3': intArgs,
    'fact_sym_arg/3': symArgs,
    'fact_str_arg/3': strArgs,
  });
};



const transformFactCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { negated, name, args, time, line } = bodyRule['FactCondition'];
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
      const { location } = arg;
      varArgs.push([
        clauseN, ruleN, argN, argToSymbol(arg), boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else if (isString(arg)) { strArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return tables.mergeDeep({
    'body_rule/4': [
      [filename, line, clauseN, ruleN]
    ],
    'body_fact/4': [
      [clauseN, ruleN, argToSymbol(name), boolToSymbol(negated)]
    ],
    'body_fact_var_time/3': varTime,
    'body_fact_int_time/3': intTime,
    'body_var_arg/5': varArgs,
    'body_int_arg/4': intArgs,
    'body_sym_arg/4': symArgs,
    'body_str_arg/4': strArgs,
  });
};



const transformOperatorCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { left, right, op, line } = bodyRule['OperatorCondition'];

  const varArgs = [];
  const intArgs = [];
  [left, right].forEach((arg, argN) => {
    const tuple = [clauseN, ruleN, argN, arg];
    if (isVariable(arg)) {
      const { location } = arg;
      varArgs.push([
        clauseN, ruleN, argN, argToSymbol(arg), boolToSymbol(location)
      ]);
    } else if (isInteger(arg)) { intArgs.push(tuple); }
    else {
      throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
    }
  });

  return tables.mergeDeep({
    'body_rule/4': [
      [filename, line, clauseN, ruleN]
    ],
    'body_binop/3': [
      [clauseN, ruleN, {symbol: op}]
    ],
    'body_var_arg/5': varArgs,
    'body_int_arg/4': intArgs,
  });
};



const transformChooseCondition = (tables, bodyRule, clauseN, ruleN, filename) => {
  const { line, keyvars, rowvars } = bodyRule['ChooseCondition'];

  const varToTuple = (arg, argN) => [clauseN, ruleN, argN, argToSymbol(arg)];
  const keyVars = keyvars.map(varToTuple);
  const rowVars = rowvars.map(varToTuple);

  return tables.mergeDeep({
    'body_rule/6': [
      [filename, line, clauseN, ruleN]
    ],
    'body_choose/2': [[clauseN, ruleN]],
    'body_choose_key_var/4': keyVars,
    'body_choose_row_var/4': rowVars,
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
    const tuple = [clauseN, argN, arg];
    if (isSymbol(arg)) {
      symArgs.push([clauseN, argN, argToSymbol(arg)]);
    } else if (isVariable(arg)) {
      const { location, afunc } = arg;
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

  const suffix1 = suffix ?? {Atom: 'none'};
  return tables1.mergeDeep({
    'clause/5': [
      [filename, line, name, clauseN, suffix1]
    ],
    'clause_var_arg/5': varArgs,
    'clause_int_arg/3': intArgs,
    'clause_str_arg/3': strArgs,
    'clause_sym_arg/3': symArgs,
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

  return tables;
};



export {
  tree2tables
}