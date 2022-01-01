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



const extractPairFromCondition = (cond) => {
  const [a, op, b] = cond;

  if (op !== '=') {
    return null;
  }

  const isVarA = typeof a === 'string';
  const isVarB = typeof b === 'string';
  if (isVarA && !isVarB) {
    return [a, b];
  }
  if (!isVarA && isVarB) {
    return [b, a];
  }
  return null;
};

const newColumnsFromConditions = (columns, conditions0) => {
  // Find first expression Var = value1, when Var is not among columns
  // and select it for a new value.
  //
  // If we have several occurences for same Var, then second
  // would be treated as predicate later. Would work alright.

  const conditions = [];
  const pairs = [];
  conditions0.forEach(cond => {
    const pair = extractPairFromCondition(cond);
    if (!pair) {
      conditions.push(cond);
      return;
    }

    if (columns.includes(pair[0])) {
      // already have this var name as column, keep it as condition
      conditions.push(cond);
      return;
    }
    
    const [addedColumns, _vals] = _.unzip(pairs);
    if (addedColumns.includes(pair[0])) {
      // already have this var name as new column, keep it as condition
      conditions.push(cond);
      return;
    }

    // otherwise, add it as new pair
    // and do not add to list of conditions
    pairs.push(pair);
  });

  return { pairs, conditions };
};



const constructRowPredicate = (columns, cond) => {
  const [a, op, b] = cond;
  const isVarA = typeof a === 'string';
  const isVarB = typeof b === 'string';

  return (row) => {
    const aValue = isVarA ? row[columns.indexOf(a)] : a;
    const bValue = isVarB ? row[columns.indexOf(b)] : b;
    switch (op) {
      case '=': return _.isEqual(aValue, bValue);
      case '=/=': return !_.isEqual(aValue, bValue);
      default: throw new Error(`Unknown operator: ${op}`);
    }
  };
};

const constructPredicate = (columns, conditions) => {
  const predicates = conditions.map(cond => constructRowPredicate(columns, cond));
  return (row) => _.every(predicates, p => p(row));
};



class Table {
  // we take certain fact name and map it according to variables
  static fromFacts(facts, key, params) {
    const [_, n] = key.split('/');
    if (parseInt(n) != vars.length) {
      throw new Error(`Arity of the tuple ${key} doesn't match variables ${JSON.stringify(vars)}`);
    }

    const { rows, columns } = projectFactsToRows(facts.get(key), params);
    return new Table(columns, rows);
  }

  constructor(columns = [], rows = []) {
    this.columns = columns;
    this.rows = rows;
  }

  // natural join
  join(table2) {
    const { rows, columns } = joinTables(this, table2);
    return new Table(columns, rows);
  }

  // if two tables don't have any shared column names,
  // then join works as cross product
  crossProduct(table2) {
    if (_.some(this.columns, col => table2.columns.includes(col))) {
      throw new Error(`Tables should not have shared columns for cross-product`);
    }

    return this.join(table2);
  }

  projectColumns(columns) {
    if (_.some(columns, name => !this.columns.includes(name))) {
      // we are requested project a column name that is not present
      throw new Error(`Unexpected columns to project ${JSON.stringify(columns)} from ${JSON.stringify(this.columns)}`);
    }
    const rows1 = this.rows.forEach(row => {
      const pairs = projectRowValues(row, this.columns, columns);
      const [_cols, values] = _.unzip(pairs);
      return values;
    });
    const rows = _.uniqWith(rows1, _.isEqual);
    return new Table(columns, rows)
  }

  select(conditions0) {
    const { pairs, conditions: conditions1 } = newColumnsFromConditions(this.columns, conditions0);

    // create table that has only one row
    // with all values that must be added to each row
    // we just crossproduct it with filtered rows
    const [newCols, newVals] = _.unzip(pairs);
    const newValsTable = new Table(newCols, [newVals]);

    const t = this.crossProduct(newValsTable);

    const predicate = constructPredicate(t.columns, conditions1);
    const filteredRows = t.rows.filter(predicate);
    return new Table(t.columns, filteredRows);
  }
}



export {
  Table
}