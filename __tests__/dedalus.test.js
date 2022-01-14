import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import _ from 'lodash';

import { validateFile, parseDedalus } from '../js_src/index.js';
import { runDeductively, prettyPrintFacts } from '../js_src/index.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const findTestcases = async ({ in_dir = '.', skip = [] }) => {
  const testcaseRe = /^([a-zA-Z0-9_]+)\.test\.dedalus$/;
  const dirPath = path.join(__dirname, in_dir);
  const filenames0 = await fs.readdir(dirPath);
  const filenames1 = filenames0
    .filter(filename => testcaseRe.test(filename))
    .filter(filename => {
      const mustBeSkipped = _.some(skip, filename1 =>
        _.isEqual(filename, `${filename1}.test.dedalus`));
        const notATest = !testcaseRe.test(filename);
        return !(mustBeSkipped || notATest);
      });

  const testcases = filenames1.map(filename => filename.match(testcaseRe)[1]);
  return {
    toRun: testcases.map(t => [t]),
    toSkip: skip.map(t => [t])
  };
};

const testcases = {};
testcases.validator = await findTestcases({
  in_dir: 'validator',
  skip: [
    'negated_not_in_positive',
    'facts_without_timestamps',
  ],
});
testcases.parser = await findTestcases({
  in_dir: 'parser',
  // skip: [
  // ],
});



describe("validator", () => {
  // just to report that there are skipped tests
  if (testcases.validator.toSkip.length != 0) {
    test.skip.each(testcases.validator.toSkip)('%s', async (name) => null);
  }

  test.each(testcases.validator.toRun)('%s', async (name) => {
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
  // just to report that there are skipped tests
  if (testcases.parser.toSkip.length != 0) {
    test.skip.each(testcases.parser.toSkip)('%s', async (name) => null);
  }
  test.each(testcases.parser.toRun)('%s', async (name) => {
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
