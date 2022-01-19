import _ from "lodash";

const symbolRe = /^[a-z][a-zA-Z0-9_]*$/
const doesSymbolNeedEscaping = (str) => !symbolRe.test(str);

const ppStr = (value) => `"${value['string']}"`;
const ppInt = (value) => String(value);
const ppSymbol = (value) => {
  if (doesSymbolNeedEscaping(value['symbol'])) {
    return `'${value['symbol']}'`;
  }
  return value['symbol'];
}
const ppVar = ({ name, aggFunc, locPrefix }) => {
  if (aggFunc['symbol'] != 'none') {
    if (locPrefix['symbol'] == 'true') {
      throw new Error('Location prefix and aggregation at the same time');
    }
    return `${aggFunc['symbol']}<${name['symbol']}>`;
  }

  if (locPrefix['symbol'] == 'true') {
    return `#${name['symbol']}`;
  }

  if (locPrefix['symbol'] == 'false') {
    return `${name['symbol']}`;
  }

  throw new Error('Incorrect var for pretty printing')
};

const prettyPrintValue = (value) => {
  if (typeof value === 'number') {
    return ppInt(value);
  }
  if (value['symbol']) {
    return ppSymbol(value);
  }
  if (value['string']) {
    return ppStr(value);
  }

  throw new Error(`Unknown type of value to display: ${JSON.stringify(value)}`);
};

const prettyPrintFacts = (tFacts) => {
  const lines = [...tFacts].flatMap(([timestamp, facts]) => {
    return [...facts].flatMap(([key, tuples]) => {
      const [name, _arity] = key.split('/');
      return tuples.map(args => {
        if (args.length === 0) {
          return `${name}@${timestamp};`;
        }
  
        const args1 = args
          .map(prettyPrintValue)
          .reduce((acc, part) => acc.concat(`, ${part}`));
        return `${name}(${args1})@${timestamp};`;
      });
    });
  });

  if (lines.length === 0) {
    return '';
  }

  return lines.reduce((acc, line) => acc.concat(`\n${line}`));
};



const atomsAndClausesByFileAndLineNum = (astFacts) => {
  const atomsFilenames = astFacts
    .get('ast_atom_location/3').map(t => t[0]);
  const clausesFilenames = astFacts
    .get('ast_clause_location/3').map(t => t[0]);
  const filenames = _.uniqBy(
    [...atomsFilenames, ...clausesFilenames],
    _.isEqual);
  
  return (new Map(filenames.map(filename => {
    const atomsPairs = astFacts.get('ast_atom_location/3')
      .filter(t => _.isEqual(t[0], filename))
      .map(([_, line, atomId]) => ({ atomId, line }));
    const clausesPairs = astFacts.get('ast_clause_location/3')
      .filter(t => _.isEqual(t[0], filename))
      .map(([_, line, clauseId]) => ({ clauseId, line }));
    const sortedIds = _.sortBy([...atomsPairs, ...clausesPairs], t => t[0])
      .map(({ line }) => line);
    return [filename, sortedIds];
  })));
};



const prettyPrintAtom = (astFacts, atomId) => {
  const [name, _id, timestamp] = _.find(
    astFacts.get('ast_atom/3'),
    ([_name, id, _timestamp]) => _.isEqual(id, atomId));
  
  const symArgsPairs = astFacts.get('ast_atom_sym_arg/3')
    .filter(([id, index, value]) => _.isEqual(id, atomId))
    .map(([index, value]) => [index, ppSymbol(value)]);
  const intArgsPairs = astFacts.get('ast_atom_int_arg/3')
    .filter(([id, index, value]) => _.isEqual(id, atomId))
    .map(([index, value]) => [index, ppInt(value)]);
  const strArgsPairs = astFacts.get('ast_atom_str_arg/3')
    .filter(([id, index, value]) => _.isEqual(id, atomId))
    .map(([index, value]) => [index, ppInt(value)]);

  const argsStrs = _.sortBy(
    [...symArgsPairs, ...intArgsPairs, ...strArgsPairs],
    ([index, str]) => index);
  
  const expectedIndexes = _.range(1, argsStrs.length+1);
  const [collectedIndexes, _strs] = _.unzip(argsStrs);
  if (!_.isEqual(expectedIndexes, collectedIndexes)) {
    throw new Error(`Incorrect indexes for atom: ${ppSymbol(atomId)}`);
  }

  if (argsStrs.length == 0) {
    return [`${ppSymbol(name)}@${ppInt(timestamp)};`];
  }

  return [`${ppSymbol(name)}(${argsStrs.join(', ')})@${ppInt(timestamp)};`];
};

const prettyPrintBody = (astFacts, clauseId) => {
  // add identation
  //
  // Currently order of body expressions is not stored in AST.
  // let's print in following order:
  //
  //    positive, choose, negative, binop

  return [];
};

const prettyPrintClause = (astFacts, clauseId) => {
  const [name, _id, suffix] = _.find(
    astFacts.get('ast_clause/3'),
    ([_name, id, _suffix]) => _.isEqual(id, clauseId));
  
  const symArgsPairs = astFacts.get('ast_clause_sym_arg/3')
    .filter(([id, index, value]) => _.isEqual(id, clauseId))
    .map(([index, value]) => [index, ppSymbol(value)]);
  const intArgsPairs = astFacts.get('ast_clause_int_arg/3')
    .filter(([id, index, value]) => _.isEqual(id, clauseId))
    .map(([index, value]) => [index, ppInt(value)]);
  const strArgsPairs = astFacts.get('ast_clause_str_arg/3')
    .filter(([id, index, value]) => _.isEqual(id, clauseId))
    .map(([index, value]) => [index, ppInt(value)]);
  const varArgsPairs = astFacts.get('ast_clause_var_arg/5')
    .filter(([id, index, value]) => _.isEqual(id, clauseId))
    .map(([index, name, aggFunc, locPrefix]) =>
      [index, ppVar({ name, aggFunc, locPrefix })]);

  const argsStrs = _.sortBy(
    [ ...symArgsPairs, ...intArgsPairs,
      ...strArgsPairs, ...varArgsPairs],
    ([index, str]) => index);
  
  const expectedIndexes = _.range(1, argsStrs.length+1);
  const [collectedIndexes, _strs] = _.unzip(argsStrs);
  if (!_.isEqual(expectedIndexes, collectedIndexes)) {
    throw new Error(`Incorrect indexes for atom: ${ppSymbol(atomId)}`);
  }

  let head = ppSymbol(name);
  if (argsStrs.length != 0) {
    head += `(${argsStrs.join(', ')})`;
  }
  switch (suffix['symbol']) {
    case 'none': break;
    case '@next':
    case '@async':
      head += suffix['symbol'];
      break;
    default:
      throw new Error(`Unknown clause suffix: ${suffix['symbol']}`);
  }

  const bodyLines = prettyPrintBody(astFacts, clauseId);
  return [`${head} :-`, ...bodyLines];
};



// this function prints out source code from AST.
const prettyPrintAST = (astFacts) => {
  // Would be better if we print out clauses in same order as they are in AST,
  // This way it would be easier for humans to scan differences.
  // We can do this by ordering by line numbers.
  //
  // also, in case if we have ast of several files,
  // order by filename.

  const orderedIds = atomsAndClausesByFileAndLineNum(astFacts);

  const lines0 = orderedIds.keys().flatMap(filename => {
    const lines = orderedIds.flatMap(arg => {
      const { atomId, clauseId } = arg;
      if (atomId) {
        return prettyPrintAtom(astFacts, atomId);
      }
      if (clauseId) {
        return prettyPrintClause(astFacts, clauseId);
      }

      throw new Error(`Unknown arg for pretty printing: ${JSON.stringify(arg)}`);
    });

    return [`%%% file: ${filename}`, ...lines];
  });

  return lines0.reduce((acc, line) => acc.concat(`\n${line}`));
}



export {
  prettyPrintFacts,
  prettyPrintAST,
}