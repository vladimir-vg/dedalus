import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';

import { tree2tables } from './ast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const grammarPath = path.join(__dirname, 'grammar.pegjs');



const runFile = async (path) => {
  const grammarText = await fs.readFile(grammarPath);
  const dedalusText = await fs.readFile(path);
  const parser = peg.generate(String(grammarText));
  const tree = parser.parse(String(dedalusText));
  const astTables = tree2tables(tree, path);
  console.log(astTables.toJS());

  const facts0 = getInitialFacts(astTables);
  const initialTimestamp = getMinimalTimestamp(facts0);
  const rules = getRules(astTables);
  const runtime = new Interpreter(initialTimestamp, rules);

  // if we have exactly same output as previous step
  // then we are stale, no need to run further
  while (!runtime.isStale()) {
    const timestamp = runtime.getCurrentTimestamp();
    const facts = initalFactsForTimestamp(timestamp+1, astTables);
    runtime.insertFactsForNextTick(facts);
    // here we also could insert incoming event facts from other nodes
    // runtime.insertFactsForNextTick(eventsFromOtherNodes);

    // compute all @next and @async rules, store computed facts
    // return emitted @async facts to be delivered outside
    const { events } = runtime.tick();
  }
};



export {
  runFile
}