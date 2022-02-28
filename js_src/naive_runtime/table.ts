import _ from 'lodash';
import hash from 'object-hash';



const projectFactsToRows = (tuples, params) => {
  // vars might be repeated, also might be ignored
  // only unique non-ignored vars are kept as columns

  const columns = _.uniq(
    params
      .filter(param => param.variable && (param.variable[0] !== '_'))
      .map(param => param.variable));
  const rows1 = [];

  // if param is string, then assume it to be a variable name
  // anything else is value that we need to compare against row fields
  const comparisonIndexes = params
    .map((e, index) => index)
    .filter(index => !params[index].variable);
// if (columns.length == 0) debugger
  tuples.forEach(tuple => {
    const matchesConstValues = _.every(
      comparisonIndexes,
      index => _.isEqual(tuple[index], params[index]));

    if (!matchesConstValues) { return; }

    const pairs =  _.uniqWith(_.zip(params, tuple), _.isEqual);
    const row = columns.map(varname => {
      const pairs1 = pairs.filter(([param, _value]) => param.variable == varname);
      // if we have exactly one value, then there is no conflict
      // in value assignment to columns
      if (pairs1.length == 1) {
        return pairs1[0][1];
      }

      // bad row, doesn't match
      // should move to next row immediately,
      // but for simplicity just return
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


const antijoinTables = (table1, table2) => {
  // remove all rows from table1 that have at least one match in table2
  const sharedColumns = _.intersection(table1.columns, table2.columns);
  const rows = table1.rows.filter(row1 => {
    const sharedPairs1 = projectRowValues(row1, table1.columns, sharedColumns);
    const hasMatching = table2.rows.some(row2 => {
      const sharedPairs2 = projectRowValues(row2, table2.columns, sharedColumns);
      return _.isEqual(sharedPairs1, sharedPairs2);
    });
    return !hasMatching;
  });
  const { columns } = table1;
  return { rows, columns };
}



const extractPairFromCondition = (cond) => {
  const [a, op, b] = cond;

  if (op !== '=') {
    return null;
  }

  const isVarA = !!a.variable;
  const isVarB = !!b.variable;
  if (isVarA && !isVarB) {
    return [a.variable, b];
  }
  if (!isVarA && isVarB) {
    return [b.variable, a];
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
  const isVarA = !!a.variable;
  const isVarB = !!b.variable;

  return (row) => {
    const aValue = isVarA ? row[columns.indexOf(a.variable)] : a;
    const bValue = isVarB ? row[columns.indexOf(b.variable)] : b;

    const isNumberA = (typeof aValue == 'number');
    const isNumberB = (typeof bValue == 'number');

    switch (op) {
      case '=': return _.isEqual(aValue, bValue);
      case '=/=': return !_.isEqual(aValue, bValue);
      case 'succ': return isNumberA && isNumberB && (aValue+1 == bValue);
      case 'succ-neg': return isNumberA && isNumberB && (aValue+1 != bValue);
      default: throw new Error(`Unknown operator: ${op}`);
    }
  };
};

const constructPredicate = (columns, conditions) => {
  const predicates = conditions.map(cond => constructRowPredicate(columns, cond));
  return (row) => _.every(predicates, p => p(row));
};



const aggregateValues = (key, values) => {
  switch (key) {
    case 'max': return Math.max.apply(null, values);
    case 'min': return Math.min.apply(null, values);
    case 'sum': return _.sum(values);
    case 'count': { return values.length};
    default:
      throw new Error(`Unknown aggregation function ${key}`);
  }
};



const aggregateRows = (table, params) => {
  // pick columns that are not aggregated
  // group by them
  // for each group, compute aggregated value

  const aggregatedColumns = params
    .filter(param => param.variable && param.aggFunc != 'none')
    .map(param => param.variable);
  const keyColumns = params
    .filter(param => param.variable && !aggregatedColumns.includes(param.variable))
    .map(param => param.variable);
  
  const groups : {[key: string]: any[][]} = {};
  table.rows.forEach(row => {
    const groupValues = projectRowValues(row, table.columns, keyColumns);
    const key = hash(groupValues);
    groups[key] ??= [];
    groups[key].push(row);
  });

  const rows = Object.entries(groups)
    .map(([_groupKey, rows]) => {
      return params.map(param => {
        if (param.variable && param.aggFunc !== 'none') {
          const values0 = rows.map(row => row[table.columns.indexOf(param.variable)]);
          const values = _.uniqWith(values0, _.isEqual);
          return aggregateValues(param.aggFunc, values);
        }
        if (param.variable) {
          // since rows are grouped
          // and we work with non-aggregated variable
          // then any element in rows would have
          // same value by for this index
          // so just pick first one
          return rows[0][table.columns.indexOf(param.variable)];
        }
        return param; // return constant value as is
      });
    });
  return rows;
};



class Table {
  columns: string[];
  rows: any[][];

  // we take certain fact name and map it according to variables
  static fromFacts(facts, key, params) {
    // const [_, n] = key.split('/');
    // if (parseInt(n) != params.length) {
    //   throw new Error(`Arity of the tuple ${key} doesn't match variables ${JSON.stringify(params)}`);
    // }

    const { rows, columns } = projectFactsToRows((facts.get(key) ?? []), params);
    return new Table(columns, rows);
  }

  constructor(columns = [], rows = []) {
    this.columns = columns;
    this.rows = rows;
  }

  naturalJoin(table2) {
    const { rows, columns } = joinTables(this, table2);
    return new Table(columns, rows);
  }

  antijoin(table2) {
    const { rows, columns } = antijoinTables(this, table2);
    return new Table(columns, rows);
  }

  // if two tables don't have any shared column names,
  // then join works as cross product
  crossProduct(table2) {
    if (_.some(this.columns, col => table2.columns.includes(col))) {
      throw new Error(`Tables should not have shared columns for cross-product`);
    }

    return this.naturalJoin(table2);
  }

  projectColumns(params) {
    const hasUnknownColumn = _.some(params, col =>
      col.variable && !this.columns.includes(col.variable));
    if (hasUnknownColumn) {
      // we are requested project a column name that is not present
      throw new Error(`Unexpected columns to project ${JSON.stringify(params)} from ${JSON.stringify(this.columns)}`);
    }

    return aggregateRows(this, params);
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