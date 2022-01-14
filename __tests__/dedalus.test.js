import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import _ from 'lodash';

import { validateFile, parseDedalus } from '../js_src/index.js';
import { runDeductively, prettyPrintFacts } from '../js_src/index.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("validator", () => {
  const testcases = [
    ['time_suffix_not_in_async'],
    ['negation_in_dep_cycle'],
  
    // we need negation support to run this testcase
    // ['negated_not_in_positive'],
  ];
  test.each(testcases)('%s', async (name) => {
    const inputPath = path.join(__dirname, `./validator/${name}.in.dedalus`);
    const matcherPath = path.join(__dirname, `./validator/${name}.test.dedalus`);
  
    const inputText = await fs.readFile(inputPath);
    const validationFacts = await validateFile(inputText, `./validator/${name}.in.dedalus`);
  
    // now when we got results of validation,
    // we need to supply them as facts and run the matcher code
  
    const matcherText = await fs.readFile(matcherPath);
    await runDedalusTest(validationFacts, matcherText);
  });
});



describe('parser', () => {
  const testcases = [
    ['choose'],
    ['broadcast'],
    ['lamport_clock'],
    ['various'],
  ];
  test.each(testcases)('%s', async (name) => {
    const inputPath = path.join(__dirname, `./parser/${name}.in.dedalus`);
    const matcherPath = path.join(__dirname, `./parser/${name}.test.dedalus`);
  
    const inputText = await fs.readFile(inputPath);
    const astFacts = await parseDedalus(inputText, `./parser/${name}.in.dedalus`);
  
    // now when we got results of validation,
    // we need to supply them as facts and run the matcher code
  
    const matcherText = await fs.readFile(matcherPath);
    await runDedalusTest(astFacts, matcherText);
  });
});



const runDedalusTest = async (inputFacts, matcherText) => {
  const matchingFacts = await runDeductively(inputFacts, matcherText, '*matcher*');
  const lastTimestamp = [...matchingFacts.keys()].reduce((t1, t2) => Math.max(t1,t2));
  const tupleMap = matchingFacts.get(lastTimestamp);

  const testPassedKeys = [...tupleMap.keys()].filter(key => key.startsWith('test_passed/'));
  const testFailedKeys = [...tupleMap.keys()].filter(key => key.startsWith('test_failed/'));

  // if we have test_failed, then failed
  // if we don't have any test_passed, then also failed
  // otherwise passed
  const hasAtLeastOneFailure = _.some(testFailedKeys, key => 
    tupleMap.get(key).length !== 0);
  const hasAtLeastOnePass = _.some(testPassedKeys, key => 
    tupleMap.get(key).length !== 0);
  
  if (hasAtLeastOneFailure || !hasAtLeastOnePass) {
    console.log(prettyPrintFacts(matchingFacts));
  }
  
  expect(hasAtLeastOneFailure).toEqual(false);
  expect(hasAtLeastOnePass).toEqual(true);
};
