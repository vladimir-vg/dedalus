
const symbolRe = /^[a-z][a-zA-Z0-9_]*$/
const doesSymbolNeedEscaping = (str) => !symbolRe.test(str);

const prettyPrintValue = (value) => {
  if (typeof value === 'number') {
    return `${value}`;
  }
  if (value['symbol']) {
    if (doesSymbolNeedEscaping(value['symbol'])) {
      return `'${value['symbol']}'`;
    }
    return value['symbol'];
  }
  if (value['string']) {
    return `"${value['string']}"`;
  }

  throw new Error(`Unknown type of value to display: ${JSON.stringify(value)}`);
};

const prettyPrintFacts = (facts) => {
  const lines = [...facts].flatMap(([timestamp, tupleMap]) => {
    return [...tupleMap].flatMap(([key, tuples]) => {
      debugger
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



export {
  prettyPrintFacts,
}