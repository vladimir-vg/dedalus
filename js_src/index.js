import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';

import {
  sourceFactsFromAstFacts, tree2facts, rulesFromAstFacts, mergeFactsDeep
} from './ast.js';
import { prettyPrintFacts } from './prettyprint.js';

import { Interpreter } from './interpreter.js';



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



const runDeductively = async (inputFacts, dedalusText, path) => {
  const astFacts = await parseDedalus(dedalusText, path);

  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAstFacts(astFacts);
  const factsFromSource = sourceFactsFromAstFacts(astFacts);
  const facts = mergeFactsDeep(inputFacts, factsFromSource);
  const initialTimestamp = [...facts.keys()].reduce((t1, t2) => Math.min(t1,t2), 1);
  const runtime = new Interpreter(initialTimestamp-1, rules);

  runtime.insertFactsForNextTick(facts.get(initialTimestamp));
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