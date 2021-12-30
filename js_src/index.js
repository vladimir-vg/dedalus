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
const grammarText = await fs.readFile(grammarPath);
const dedalusParser = peg.generate(String(grammarText));



const parseDedalus = (dedalusText, filename) => {
  const tree = dedalusParser.parse(String(dedalusText));
  const astTables = tree2tables(tree, filename);
  return astTables;
};



const runFile = async (path) => {
  const dedalusText = await fs.readFile(path);
  const tree = dedalusParser.parse(String(dedalusText));
  const ast = tree2tables(tree, path);
  console.log(astTables.toJS());

  const initialTimestamp = getMinimalTimestamp(ast);
  // better to explicitly separate facts from rules
  // give interpreter only rules, provide facts from outside
  // this way it is less messy
  const rules = rulesFromAst(ast);
  const runtime = new Interpreter(initialTimestamp-1, rules);

  // if we have exactly same output as previous step
  // then we are stale, no need to run further
  do {
    const timestamp = runtime.timestamp;
    const facts = factsFromAst(ast, timestamp+1);
    runtime.insertFactsForNextTick(facts);
    // here we also could insert incoming event facts from other nodes
    // runtime.insertFactsForNextTick(eventsFromOtherNodes);

    // compute all @next and @async rules, store computed facts
    // return emitted @async facts to be delivered outside
    const { events } = runtime.tick();

    // TODO: add check, that no facts in AST left
    // if there is still something, need to jump to that timestamp
  } while (!runtime.isStale());
};



export {
  parseDedalus,
  runFile
}