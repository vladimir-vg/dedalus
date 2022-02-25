import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';

import {
  sourceFactsFromAstFacts, tree2facts, rulesFromAstFacts, mergeTFactsDeep,
  extractMetadata,
} from './ast.js';
import { prettyPrintFacts, prettyPrintAST } from './prettyprint.js';

import { Interpreter } from './naive_runtime/interpreter.js';
import _ from 'lodash';

import { Runtime } from './runtime.ts';


// current runtime is terribly slow,
// validation makes execution even longer
// skip it sometimes, when want to iterate
const SKIP_VALIDATION = false;



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const grammarPath = path.join(__dirname, 'grammar.pegjs');
const validatorPath = path.join(__dirname, '..', 'd_src', 'validator.dedalus');
// const stratifierPath = path.join(__dirname, '..', 'd_src', 'stratifier.dedalus');



const parseDedalus = async (dedalusText, filename) => {
  const grammarText = await fs.readFile(grammarPath);
  const dedalusParser = peg.generate(String(grammarText));

  const tree = dedalusParser.parse(String(dedalusText));
  const astFacts = tree2facts(tree, filename);
  return astFacts;
};



const computeStrata = async (sourceAst) => {
  // const stratifierDedalusText = await fs.readFile(stratifierPath);
  // const facts = await runDeductively(sourceAst, stratifierDedalusText, stratifierPath);

  // const vertices0 = _.groupBy(
  //   (facts.get('stratum/2') ?? []).map(([s, r]) => [s['symbol'], r['symbol']]),
  //   ([stratum, rule]) => stratum);
  // const vertices = _.mapValues(
  //   vertices0,
  //   (items) => items.map(([st, rule]) => rule));
  // const edges = (facts.get('stratum_dependency/2') ?? [])
  //   .map(([s1, s2]) => [s1['symbol'], s2['symbol']]);

  // return { vertices, edges };

  // for now must lump everything into one strata.
  // it is correct for programs that limit to deductive rules without negation or aggregation
  const allAtomNames = [...sourceAst].flatMap(([key, tuples]) => {
    switch (key) {
      case 'ast_atom/3':
      case 'ast_clause/3':
        return tuples.map(t => t[0]['symbol']);
      case 'ast_body_atom/3':
        return tuples.map(t => t[1]['symbol']);
      default: return [];
    }
  });
  const vertices = {'statum1': allAtomNames};
  const edges = [];
  return { vertices, edges };
};



const runDeductively = async (inputFacts, dedalusText, path, opts = {}) => {
  const { skipValidation } = opts;
  const astFactsT0 = await parseDedalus(dedalusText, path);
  const { explicitStrata, astTFacts } = extractMetadata(astFactsT0);

  if (!SKIP_VALIDATION && !skipValidation) {
    const tFacts = await validateFile(dedalusText, path);
    // FIXME: dirty hack for now, just pick first timestamp
    // it always gonna be AST_TIMESTAMP.
    // TODO: In future, get rid of timestamps here
    // they are not necessary.
    const facts = tFacts.get(Array.from(tFacts.keys())[0]);
    if ((facts.get('invalid_ast/0') ?? []).length != 0) {
      console.log(prettyPrintFacts(tFacts));
      throw new Error('Received invalid ast for execution');
    }
  }

  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAstFacts(astTFacts);

  // facts with timestamps that are present in source.
  const tFactsFromSource = sourceFactsFromAstFacts(astTFacts);
  // We need to insert these facts as input, when the timestamp is right
  const facts = mergeTFactsDeep(inputFacts, tFactsFromSource);

  let initialTimestamp = 1; // default initial timestamp
  if (facts.size !== 0) {
    initialTimestamp = [...facts.keys()].reduce((t1, t2) => Math.min(t1,t2));
  }

  // if we don't have explicit strata, we need to compute it
  let strata = explicitStrata ?? await computeStrata(rules);

  const initialFacts = facts.get(initialTimestamp) ?? (new Map());
  const runtime = new Interpreter({
    rules, strata,
    initialTimestamp: initialTimestamp-1,
  });
// debugger
  runtime.insertFactsForNextTick(initialFacts);
  const newFacts = runtime.deductFacts();

  return (new Map([[initialTimestamp, newFacts]]));
};



const validateFile = async (sourceDedalusText, path) => {
  const sourceAst = await parseDedalus(sourceDedalusText, path);
  const validatorDedalusText = await fs.readFile(validatorPath);

  return await runDeductively(sourceAst, validatorDedalusText, validatorPath, { skipValidation: true });
};



const runFile = async (dedalusText, path) => {
  const astFacts = await parseDedalus(dedalusText, path);

  const facts = sourceFactsFromAstFacts(astFacts);
  const initialTimestamp = [...facts.keys()].reduce((t1, t2) => Math.min(t1,t2), 1);

  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAstFacts(astFacts);
  // const initialTimestamp = getMinimalTimestamp(facts);
  const runtime = new Interpreter(initialTimestamp-1, rules);

  // if we have exactly same output as previous step
  // then we are stale, no need to run further
  runtime.insertFactsForNextTick(facts);
  const newFacts = runtime.deductFacts();
  return newFacts;

  // const tree = dedalusParser.parse(String(dedalusText));
  // const ast = tree2tables(tree, path);
  // // console.log(astTables.toJS());

  // const initialTimestamp = getMinimalTimestamp(ast);
  // // better to explicitly separate facts from rules
  // // give interpreter only rules, provide facts from outside
  // // this way it is less messy
  // const rules = rulesFromAst(ast);
  // const runtime = new Interpreter(initialTimestamp-1, rules);

  // // if we have exactly same output as previous step
  // // then we are stale, no need to run further
  // // do {
  //   const timestamp = runtime.timestamp;
  //   const facts = factsFromAst(ast, timestamp+1);
  //   runtime.insertFactsForNextTick(facts);
  //   // here we also could insert incoming event facts from other nodes
  //   // runtime.insertFactsForNextTick(eventsFromOtherNodes);

  //   // compute all @next and @async rules, store computed facts
  //   // return emitted @async facts to be delivered outside
  //   const newFacts = runtime.deductFacts();
  //   console.log(newFacts);

  //   // TODO: add check, that no facts in AST left
  //   // if there is still something, need to jump to that timestamp
  // // } while (!runtime.isStale());
};



export {
  parseDedalus,
  runFile,
  validateFile,
  prettyPrintFacts,
  prettyPrintAST,
  runDeductively,
}