import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import _ from 'lodash';

import { validateFile, runDeductively, prettyPrintFacts } from '../js_src/index.js';



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
  const matchingFacts = await runDeductively(validationFacts, matcherText, `./validator/${name}.dedalus`);
  const lastTimestamp = [...matchingFacts.keys()].reduce((t1, t2) => Math.max(t1,t2));
  const tupleMap = matchingFacts.get(lastTimestamp);
// console.log({ matchingFacts, lastTimestamp });
  const testPassedKeys = [...tupleMap.keys()].filter(key => key.startsWith('test_passed/'));
  const testFailedKeys = [...tupleMap.keys()].filter(key => key.startsWith('test_failed/'));

  console.log(prettyPrintFacts(matchingFacts));

  // testPassedKeys.forEach(key => {
  //   const tuples = tupleMap.get(key);
  //   if (tuples.length !== 0) {
  //     console.log(prettyPrintFacts(tupleMap));
  //   }
  // });
  // testFailedKeys.forEach(key => {
  //   const tuples = tupleMap.get(key);
  //   if (tuples.length !== 0) {
  //     console.log(prettyPrintFacts(new Map([[key, tuples]])));
  //   }
  // });

  // if we have test_failed, then failed
  // if we don't have any test_passed, then also failed
  // otherwise passed
  const hasAtLeastOneFailure = _.some(testFailedKeys, key => 
    tupleMap.get(key).length !== 0);
  const hasAtLeastOnePass = _.some(testPassedKeys, key => 
    tupleMap.get(key).length !== 0);
  
  expect(hasAtLeastOneFailure).toEqual(false);
  expect(hasAtLeastOnePass).toEqual(true);
});

