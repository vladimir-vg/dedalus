import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';

import {
  sourceFactsFromAstFacts, tree2facts, rulesFromAstFacts, mergeTFactsDeep,
  extractMetadata,
} from './ast.js';
import { prettyPrintFacts } from './prettyprint.js';

import { Interpreter } from './naive_runtime/interpreter.js';
import _ from 'lodash';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const grammarPath = path.join(__dirname, 'grammar.pegjs');
const validatorPath = path.join(__dirname, '..', 'd_src', 'validator.dedalus');



const parseDedalus = async (dedalusText, filename) => {
  const grammarText = await fs.readFile(grammarPath);
  const dedalusParser = peg.generate(String(grammarText));

  const tree = dedalusParser.parse(String(dedalusText));
  const astFacts = tree2facts(tree, filename);
  return astFacts;
};



const computeStrata = (ast) => {
  // for now must lump everything into one strata.
  // it is correct for programs that limit to deductive rules without negation or aggregation

  // TODO: run stratifier to obtain proper stata

  const allAtomNames = [...ast].flatMap(([key, tuples]) => {
    switch (key) {
      case 'ast_atom/3':
      case 'ast_clause/3':
        return tuples.map(t => t[0]);
      case 'ast_body_atom/3':
        return tuples.map(t => t[1]);
      default: return [];
    }
  });
  const vertices = {'statum1': allAtomNames};
  const edges = [];
  return { vertices, edges };
};



const runDeductively = async (inputFacts, dedalusText, path) => {
  const astFactsT0 = await parseDedalus(dedalusText, path);
  const { explicitStrata, astTFacts } = extractMetadata(astFactsT0);

  // TODO: validate ast

  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAstFacts(astTFacts);

  // facts with timestamps that are present in source.
  const factsFromSource = sourceFactsFromAstFacts(astTFacts);
  // We need to insert these facts as input, when the timestamp is right
  const facts = mergeTFactsDeep(inputFacts, factsFromSource);
  const DEFAULT_INITIAL_TIMESTAMP = 1;
  const initialTimestamp = [...facts.keys()].reduce((t1, t2) =>
    Math.min(t1,t2), DEFAULT_INITIAL_TIMESTAMP);

  // if we don't have explicit strata, we need to compute it
  let strata = explicitStrata ?? computeStrata(rules);

  const initialFacts = facts.get(initialTimestamp) ?? (new Map());
  const runtime = new Interpreter({
    rules, strata,
    initialTimestamp: initialTimestamp-1,
  });

  runtime.insertFactsForNextTick(initialFacts);
  const newFacts = runtime.deductFacts();

  return (new Map([[initialTimestamp, newFacts]]));
};



const validateFile = async (sourceDedalusText, path) => {
  const sourceAst = await parseDedalus(sourceDedalusText, path);
  const validatorDedalusText = await fs.readFile(validatorPath);

  return await runDeductively(sourceAst, validatorDedalusText, validatorPath);
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
  runDeductively,
}