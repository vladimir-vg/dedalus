import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import _ from 'lodash';

import { validateFile, runDeductively, prettyPrintFacts } from '../js_src/index.js';
// import { factsFromAst, clearLineNumbersFromAst } from '../js_src/ast.js';



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

  console.log(prettyPrintFacts(matchingFacts));

  const testPassedKeys = [...matchingFacts.keys()].filter(key => key.startsWith('test_passed/'));
  const testFailedKeys = [...matchingFacts.keys()].filter(key => key.startsWith('test_failed/'));

  testPassedKeys.forEach(key => {
    const tuples = matchingFacts.get(key);
    if (tuples.length !== 0) {
      console.log(prettyPrintFacts(new Map([key, tuples])));
    }
  });
  testFailedKeys.forEach(key => {
    const tuples = matchingFacts.get(key);
    if (tuples.length !== 0) {
      console.log(prettyPrintFacts(new Map([key, tuples])));
    }
  });

  // if we have test_failed, then failed
  // if we don't have any test_passed, then also failed
  // otherwise passed
  const hasAtLeastOneFailure = _.some(testFailedKeys, key => 
    matchingFacts.get(key).length !== 0);
  const hasAtLeastOnePass = _.some(testPassedKeys, key => 
    matchingFacts.get(key).length !== 0);
  
  expect(hasAtLeastOneFailure).toEqual(false);
  expect(hasAtLeastOnePass).toEqual(true);

  // we expected to have test_passed facts to be present
  // and test_failed to be absent

  // const received = Object.fromEntries(wrapTable([...inputAstWithoutLines]));
  // const expected = Object.fromEntries([...expectedFacts]);
  // expect(received).toMatchObject(expected);
});

