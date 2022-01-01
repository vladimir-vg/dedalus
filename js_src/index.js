import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';

import {
  factsFromAst, tree2tables, getMinimalTimestamp, rulesFromAst
} from './ast.js';

import { Interpreter } from './interpreter.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const grammarPath = path.join(__dirname, 'grammar.pegjs');
const validatorPath = path.join(__dirname, '..', 'd_src', 'validator.dedalus');



const parseDedalus = async (dedalusText, filename) => {
  const grammarText = await fs.readFile(grammarPath);
  const dedalusParser = peg.generate(String(grammarText));

  const tree = dedalusParser.parse(String(dedalusText));
  const astTables = tree2tables(tree, filename);
  return astTables;
};



const validateFile = async (path) => {
  const sourceDedalusText = await fs.readFile(path);
  const sourceAst = await parseDedalus(sourceDedalusText, path);
  const validatorDedalusText = await fs.readFile(validatorPath);
  const validatorAst = await parseDedalus(validatorDedalusText, validatorPath);
  
  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAst(validatorAst);
  const initialTimestamp = getMinimalTimestamp(sourceAst);
  const runtime = new Interpreter(initialTimestamp-1, rules);
  // const timestamp = runtime.timestamp;
  // const facts = factsFromAst(sourceAst, timestamp);

  // console.log({ sourceAst });

  // if we have exactly same output as previous step
  // then we are stale, no need to run further
  runtime.insertFactsForNextTick(sourceAst);
  const newFacts = runtime.deductFacts();
  return newFacts;
  // console.log(newFacts);
};



const runFile = async (path) => {
  const dedalusText = await fs.readFile(path);
  const tree = dedalusParser.parse(String(dedalusText));
  const ast = tree2tables(tree, path);
  // console.log(astTables.toJS());

  const initialTimestamp = getMinimalTimestamp(ast);
  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAst(ast);
  const runtime = new Interpreter(initialTimestamp-1, rules);

  // if we have exactly same output as previous step
  // then we are stale, no need to run further
  // do {
    const timestamp = runtime.timestamp;
    const facts = factsFromAst(ast, timestamp+1);
    runtime.insertFactsForNextTick(facts);
    // here we also could insert incoming event facts from other nodes
    // runtime.insertFactsForNextTick(eventsFromOtherNodes);

    // compute all @next and @async rules, store computed facts
    // return emitted @async facts to be delivered outside
    const newFacts = runtime.deductFacts();
    console.log(newFacts);

    // TODO: add check, that no facts in AST left
    // if there is still something, need to jump to that timestamp
  // } while (!runtime.isStale());
};



export {
  parseDedalus,
  runFile,
  validateFile,
}