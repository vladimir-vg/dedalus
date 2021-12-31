import _ from 'lodash';



const projectFactsToRows = (tuples, params) => {
  // vars might be repeated, also might be ignored
  // only unique non-ignored vars are kept as columns
  
  const columns = _.uniq(params.filter(v =>
    (typeof v == 'string') && (v[0] !== '_')));
  const rows1 = [];
  const params1 = ['_', ...params];

  // if param is string, then assume it to be a variable name
  // anything else is value that we need to compare against row fields
  const comparisonIndexes = params1
    .map((e, index) => index)
    .filter(index => typeof params1[index] !== 'string');

  tuples.forEach(tuple => {
    const matchesConstValues = _.every(comparisonIndexes, index =>
      _.isEqual(tuple[index], params1[index]));
    if (!matchesConstValues) { return; }

    const pairs =  _.uniqWith(_.zip(params1, tuple), _.isEqual);
    const row = columns.map(varname => {
      const pairs1 = pairs.filter(([varname1, _value]) => varname1 == varname);
      // if we have exactly one value, then we are good
      if (pairs1.length == 1) {
        return pairs1[0][1];
      }
      return null;
    });

    if (!row.includes(null)) {
      rows1.push(row);
    }
  });

  // remove duplicates in rows
  const rows = _.uniqWith(rows1, _.isEqual);
  return { rows, columns };
};



const projectRowValues = (values, columns, selectedColumns) => {
  return selectedColumns.map(colname => {
    const index = columns.indexOf(columns);
    const value = values[index];
    return [colname, value];
  });
};

const joinTables = (table1, table2) => {
  const sharedColumns = _.intersection(table1.columns, table2.columns);
  const columnsToAdd = _.without(table2.columns, sharedColumns);
  const columns = [...table1.columns, ...columnsToAdd];
  const sharedRows = [];

  // just walk rows in first table, extract values for shared columns
  // find all rows in second table that match that
  table1.rows.forEach(row1 => {
    const sharedPairs1 = projectRowValues(row1, table1.columns, sharedColumns);
    table2.rows.forEach(row2 => {
      const sharedPairs2 = projectRowValues(row2, table2.columns, sharedColumns);
      if (_.isEqual(sharedPairs1, sharedPairs2)) {
        const pairsToAdd = projectRowValues(row2, table2.columns, columnsToAdd);
        const [_cols, rowValues] = _.unzip(pairsToAdd);
        sharedRows.push([...row1, ...rowValues]);
      }
    });
  });

  const rows = _.uniqWith(sharedRows, _.isEqual);
  return { columns, rows };
};



class Table {
  // we take certain fact name and map it according to variables
  static fromFacts(facts, key, params) {
    const [_, n] = key.split('/');
    if (parseInt(n) != vars.length) {
      throw new Error(`Arity of the tuple ${key} doesn't match variables ${JSON.stringify(vars)}`);
    }

    const { rows, columns } = projectFactsToRows(facts.get(key), params);
    const t = new Table();
    t.rows = rows;
    t.columns = columns;
    return t;
  }

  constructor() {
    this.columns = [];
    this.rows = [];
  }

  join(table2) {
    const { rows, columns } = joinTables(this, table2);
    const t = new Table();
    t.rows = rows;
    t.columns = columns;
    return t;
  }

  projectColumns(columns) {
    // TODO: select only given columns, remove duplicates
  }

  select(conditions) {
    // TODO: filter out rows, according to = and =/= operations
    // if Var1 = 'value', where Var1 is not present among columns
    // then add Var1 as column, with 'value' everywhere.
  }
}



export {
  Table
}