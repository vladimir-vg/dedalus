import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import _ from 'lodash';

import { validateFile } from '../js_src/index.js';
import { runDedalusTest } from './util.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testcases = [
  ['time_suffix_not_in_async'],
];
test.each(testcases)('%s', async (name) => {
  const inputPath = path.join(__dirname, `./validator/${name}.in.dedalus`);
  const matcherPath = path.join(__dirname, `./validator/${name}.dedalus`);

  const inputText = await fs.readFile(inputPath);
  const validationFacts = await validateFile(inputText, inputPath);

  // now when we got results of validation,
  // we need to supply them as facts and run the matcher code

  const matcherText = await fs.readFile(matcherPath);
  await runDedalusTest(expect, validationFacts, matcherText);
});

