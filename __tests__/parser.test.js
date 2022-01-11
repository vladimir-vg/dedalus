import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import { parseDedalus } from '../js_src/index.js';
import { runDedalusTest } from './util.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const testcases = [
  ['choose'],
  ['broadcast'],
  ['lamport_clock'],
  ['various'],
];
test.each(testcases)('%s', async (name) => {
  const inputPath = path.join(__dirname, `./parser/${name}.in.dedalus`);
  const matcherPath = path.join(__dirname, `./parser/${name}.dedalus`);

  const inputText = await fs.readFile(inputPath);
  const astFacts = await parseDedalus(inputText, `./parser/${name}.in.dedalus`);

  // now when we got results of validation,
  // we need to supply them as facts and run the matcher code

  const matcherText = await fs.readFile(matcherPath);
  await runDedalusTest(expect, astFacts, matcherText);
});

