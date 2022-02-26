import _ from "lodash";

import { collectListFromFacts } from './ast';



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
  if (aggFunc && aggFunc['symbol'] != 'none') {
    if (locPrefix && locPrefix['symbol'] == 'true') {
      throw new Error('Location prefix and aggregation at the same time');
    }
    return `${aggFunc['symbol']}<${name['symbol']}>`;
  }

  if (locPrefix && locPrefix['symbol'] == 'true') {
    return `#${name['symbol']}`;
  }

  return `${name['symbol']}`;
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
      const [name1, _arity] = key.split('/');
      const name = {symbol: name1};
      return tuples.map(args => {
        if (args.length === 0) {
          return `${ppSymbol(name)}@${ppInt(timestamp)};`;
        }
  
        const args1 = args
          .map(prettyPrintValue)
          .reduce((acc, part) => acc.concat(`, ${part}`));
        return `${ppSymbol(name)}(${args1})@${ppInt(timestamp)};`;
      });
    });
  });

  if (lines.length === 0) {
    return '';
  }

  return lines.reduce((acc, line) => acc.concat(`\n${line}`));
};



const atomsAndClausesByFileAndLineNum = (astFacts) => {
  const atomsFilenames = (astFacts.get('ast_atom_location/3') ?? [])
    .map(t => t[0]);
  const clausesFilenames = (astFacts.get('ast_clause_location/3') ?? [])
    .map(t => t[0]);
  const filenames = _.uniqBy(
    [...atomsFilenames, ...clausesFilenames],
    _.isEqual);
  
  return (new Map(filenames.map(filename => {
    const atomsPairs = (astFacts.get('ast_atom_location/3') ?? [])
      .filter(t => _.isEqual(t[0], filename))
      .map(([_, line, atomId]) => ({ atomId, line }));
    const clausesPairs = (astFacts.get('ast_clause_location/3') ?? [])
      .filter(t => _.isEqual(t[0], filename))
      .map(([_, line, clauseId]) => ({ clauseId, line }));
    const sortedIds = _.sortBy([...atomsPairs, ...clausesPairs], t => t[0]);
    return [filename, sortedIds];
  })));
};



const prettyPrintAtom = (astFacts, atomId) => {
  const [name, _id, timestamp] = _.find(
    astFacts.get('ast_atom/3'),
    ([_name, id, _timestamp]) => _.isEqual(id, atomId));

  const keep = ([id, index, value]) => _.isEqual(id, atomId);
  const argsStrs = collectListFromFacts(astFacts, {
    'ast_atom_sym_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppSymbol(value)]
    },
    'ast_clause_int_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppInt(value)]
    },
    'ast_clause_str_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppStr(value)]
    },
  });

  if (argsStrs.length == 0) {
    return [`${ppSymbol(name)}@${ppInt(timestamp)};`];
  }

  return [`${ppSymbol(name)}(${argsStrs.join(', ')})@${ppInt(timestamp)};`];
};



const prettyPrintBodyExpr = (astFacts, exprId, isLastExpr) => {
  const indent = "  ";

  const keep = ([id, index, name]) => _.isEqual(id, exprId);
  const argsStrs = collectListFromFacts(astFacts, {
    'ast_body_sym_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppSymbol(value)]
    },
    'ast_body_int_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppInt(value)]
    },
    'ast_body_str_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppStr(value)]
    },
    'ast_body_var_arg/4': {
      keep, getPair: ([id, index, name, locPrefix]) =>
      [index, ppVar({ name, locPrefix })]
    },
  });

  const chooseKeyVars = collectListFromFacts(astFacts, {
    'ast_body_choose_key_var/3': {
      keep, getPair: ([id, index, name]) => [index, ppVar({ name })]
    },
  });
  const chooseRowVars = collectListFromFacts(astFacts, {
    'ast_body_choose_row_var/3': {
      keep, getPair: ([id, index, name]) => [index, ppVar({ name })]
    },
  });

  const binop = _.find(
    astFacts.get('ast_body_binop/2'),
    ([id, op]) => _.isEqual(id, exprId));
  const atom = _.find(
    astFacts.get('ast_body_atom/3'),
    ([id, name, negated]) => _.isEqual(id, exprId));
  const choose = _.find(
    astFacts.get('ast_body_choose/1'),
    ([id]) => _.isEqual(id, exprId));

  const numPresent = _.sum([binop, atom, choose].map(e => !!e ? 1 : 0));
  if (numPresent !== 1) {
    debugger
    throw new Error(`Incorrect AST, several exprs for same id ${ppSymbol(exprId)}`);
  }

  let result = indent;

  if (binop) {
    const [_id, op] = binop;
    if (argsStrs.length != 2) {
      throw new Error('Exactly two arguments for binary operation expected');
    }
    result += `${argsStrs[0]} ${op['symbol']} ${argsStrs[1]}`;

  } else if (atom) {
    const [ id, name, negated ] = atom;
    if (negated['symbol'] === 'true') {
      result += `notin ${ppSymbol(name)}`;
    } else {
      result += ppSymbol(name);
    }
    if (argsStrs.length != 0) {
      result += `(${argsStrs.join(', ')})`;
    }

    const intTimestamp = _.find(
      astFacts.get('ast_body_atom_int_time/2'),
      ([id, value]) => _.isEqual(id, exprId));
    const varTimestamp = _.find(
      astFacts.get('ast_body_atom_var_time/2'),
      ([id, value]) => _.isEqual(id, exprId));
    
    if (intTimestamp) {
      const [id, val] = intTimestamp;
      result += `@${ppInt(val)}`;
    } else if (varTimestamp) {
      const [id, name] = varTimestamp ;
      result += `@${ppVar({ name })}`;
    }
  } else if (choose) {
    result += `choose((${chooseKeyVars.join(', ')}), (${chooseRowVars.join(', ')}))`;
  } else {
    throw new Error(`Unknown expr for id ${exprId}`);
  }

  if (isLastExpr) {
    result += ';';
  } else {
    result += ','
  }

  return [result];
};



const prettyPrintBody = (astFacts, clauseId) => {
  const exprIds = astFacts.get('ast_body_expr/2')
    .filter(([clauseId1, exprId]) => _.isEqual(clauseId, clauseId1))
    .map(([clauseId1, exprId]) => exprId);
  const exprPairs = exprIds.map((exprId, index) => {
    const [_fname, linenum, _id] = _.find(
      astFacts.get('ast_body_expr_location/3'),
      ([_fname, _line, exprId1]) => _.isEqual(exprId1, exprId));
    const isLastExpr = (index == exprIds.length-1);
    return [linenum, prettyPrintBodyExpr(astFacts, exprId, isLastExpr)];
  });

  const [_linenums, exprStrs] = _.unzip(_.sortBy(exprPairs, ([line, str]) => line));

  return exprStrs;
};



const prettyPrintClause = (astFacts, clauseId) => {
  const [name, _id, suffix] = _.find(
    astFacts.get('ast_clause/3'),
    ([_name, id, _suffix]) => _.isEqual(id, clauseId));
  
  const keep = ([id, _index, _value]) => _.isEqual(id, clauseId);
  const argsStrs = collectListFromFacts(astFacts, {
    'ast_clause_sym_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppSymbol(value)]
    },
    'ast_clause_int_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppInt(value)]
    },
    'ast_clause_str_arg/3': {
      keep, getPair: ([id, index, value]) => [index, ppStr(value)]
    },
    'ast_clause_var_arg/5': {
      keep, getPair: ([id, index, name, aggFunc, locPrefix]) =>
      [index, ppVar({ name, aggFunc, locPrefix })]
    },
  });

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

  const lines0 = [...orderedIds].flatMap(([filename, ids]) => {
    const lines = ids.flatMap(arg => {
      const { atomId, clauseId } = arg;
      if (atomId) {
        return prettyPrintAtom(astFacts, atomId);
      }
      if (clauseId) {
        return prettyPrintClause(astFacts, clauseId);
      }

      throw new Error(`Unknown arg for pretty printing: ${JSON.stringify(arg)}`);
    });

    return [`%%% file: ${filename['string']}`, ...lines];
  });

  if (lines0.length === 0) {
    return '';
  }
  return lines0.reduce((acc, line) => acc.concat(`\n${line}`));
}



export {
  prettyPrintFacts,
  prettyPrintAST,
}