import _ from 'lodash';



const projectFactsToRows = (tuples, params) => {
  // vars might be repeated, also might be ignored
  // only unique non-ignored vars are kept as columns

  const columns = _.uniq(params.filter(v =>
    (typeof v == 'string') && (v[0] !== '_')));
  const rows1 = [];

  // if param is string, then assume it to be a variable name
  // anything else is value that we need to compare against row fields
  const comparisonIndexes = params
    .map((e, index) => index)
    .filter(index => typeof params[index] !== 'string');
// if (columns.length == 0) debugger
  tuples.forEach(tuple => {

    const matchesConstValues = _.every(comparisonIndexes, index =>
      _.isEqual(tuple[index], params[index]));
    if (!matchesConstValues) { return; }

    const pairs =  _.uniqWith(_.zip(params, tuple), _.isEqual);
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
    const index = columns.indexOf(colname);
    const value = values[index];
    return [colname, value];
  });
};

const joinTables = (table1, table2) => {
  // if (table2.rows.length === 0) {
  //   return table1;
  // }

  const sharedColumns = _.intersection(table1.columns, table2.columns);
  const columnsToAdd = table2.columns.filter(col => !sharedColumns.includes(col));
  const columns = [...table1.columns, ...columnsToAdd];
  const sharedRows = [];

  // if (sharedColumns.length === 0 && columnsToAdd.length == 0) debugger;
  // just walk rows in first table, extract values for shared columns
  // find all rows in second table that match that
  table1.rows.forEach(row1 => {
    const sharedPairs1 = projectRowValues(row1, table1.columns, sharedColumns);
    table2.rows.forEach(row2 => {
      const sharedPairs2 = projectRowValues(row2, table2.columns, sharedColumns);
      if (_.isEqual(sharedPairs1, sharedPairs2)) {
        const pairsToAdd = projectRowValues(row2, table2.columns, columnsToAdd);
        if (pairsToAdd.length !== 0) {
          const [_cols, rowValues] = _.unzip(pairsToAdd);
          sharedRows.push([...row1, ...rowValues]);
        } else {
          // if we have new columns, table2 works as a filter for table2
          // table2 also may have just single empty row
          // in that case, just keep values from table1
          sharedRows.push(row1);
        }
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
    
    if (pairs.length !== 0) {
      const [addedColumns, _vals] = _.unzip(pairs);
      if (addedColumns.includes(pair[0])) {
        // already have this var name as new column, keep it as condition
        conditions.push(cond);
        return;
      }
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
    if (parseInt(n) != params.length) {
      throw new Error(`Arity of the tuple ${key} doesn't match variables ${JSON.stringify(params)}`);
    }

    const { rows, columns } = projectFactsToRows((facts.get(key) ?? []), params);
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
    const hasUnknownColumn = _.some(columns, col =>
      (typeof col == 'string') && !this.columns.includes(col));
    if (hasUnknownColumn) {
      // we are requested project a column name that is not present
      throw new Error(`Unexpected columns to project ${JSON.stringify(columns)} from ${JSON.stringify(this.columns)}`);
    }

    const rows1 = this.rows.map(row => {
      return columns.map(col => {
        if (typeof col === 'string') {
          return row[this.columns.indexOf(col)];
        }
        return col; // return constant value as is
      });
    });
    const rows = _.uniqWith(rows1, _.isEqual);
    return rows;
  }

  select(conditions0) {
    const { pairs, conditions: conditions1 } = newColumnsFromConditions(this.columns, conditions0);

    // create table that has only one row
    // with all values that must be added to each row
    // we just crossproduct it with filtered rows
    let newValsTable = new Table([], [[]]);
    // if there are no new columns, we still need to
    // insert empty row, so join would keep everything as is
    if (pairs.length !== 0) {
      const [newCols, newVals] = _.unzip(pairs);
      newValsTable = new Table(newCols, [newVals]);
    }

    const t = this.crossProduct(newValsTable);

    const predicate = constructPredicate(t.columns, conditions1);
    const filteredRows = t.rows.filter(predicate);
// debugger
    return new Table(t.columns, filteredRows);
  }
}



export {
  Table
}