import { Map } from 'immutable';

const transformFact = (tables, item, factN, filename) => {
  const { line, name, time, args } = item['Fact'];

  const intArgs = [];
  const atomArgs = [];
  const strArgs = [];
  args.forEach((arg, argN) => {
    const tuple = [factN, argN, arg];
    if (typeof arg === 'number') {
      intArgs.push(tuple);
      return;
    } else if ('Atom' in arg) {
      atomArgs.push(tuple);
      return;
    } else if (typeof arg === 'string') {
      strArgs.push(tuple);
      return;
    }

    throw new Error(`Unknown fact argument type: ${JSON.stringify(arg)}`);
  });

  return tables.mergeDeep({
    'fact/5': [
      [filename, line, name, factN, time]
    ],
    'fact_int_arg/3': intArgs,
    'fact_atom_arg/3': atomArgs,
    'fact_str_arg/3': strArgs,
  });
};



const transformItem = (tables, item, factN, filename) => {
  if (item['Fact']) {
    return transformFact(tables, item, factN, filename);
  }

  // throw new Error(`Unknown type of item: ${item}`);
  return tables;
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