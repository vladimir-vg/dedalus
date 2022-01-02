
const prettyPrintValue = (value) => {
  if (typeof value === 'number') {
    return `${value}`;
  }
  if (value['symbol']) {
    // TODO: display without escaping when possible
    return `'${value['symbol']}'`;
  }
  if (value['string']) {
    return `"${value['string']}"`;
  }

  throw new Error(`Unknown type of value to display: ${JSON.stringify(value)}`);
};

const prettyPrintFacts = (facts) => {
  const lines = [...facts.entries()].flatMap(([key, tuples]) => {
    const [name, _arity] = key.split('/');
    return tuples.map(row => {
      const [timestamp, ...args] = row;

      if (args.length === 0) {
        return `${name}@${timestamp};`;
      }

      const args1 = args
        .map(prettyPrintValue)
        .reduce((acc, part) => acc.concat(`, ${part}`));
      return `${name}(${args1})@${timestamp};`;
    });
  });

  return lines.reduce((acc, line) => acc.concat(`\n${line}`));
};



export {
  prettyPrintFacts,
}