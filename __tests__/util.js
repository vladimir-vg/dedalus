import _ from 'lodash';

import { runDeductively, prettyPrintFacts } from '../js_src/index.js';



const runDedalusTest = async (expect, inputFacts, matcherText) => {
  const matchingFacts = await runDeductively(inputFacts, matcherText, '*matcher*');
  const lastTimestamp = [...matchingFacts.keys()].reduce((t1, t2) => Math.max(t1,t2));
  const tupleMap = matchingFacts.get(lastTimestamp);

  const testPassedKeys = [...tupleMap.keys()].filter(key => key.startsWith('test_passed/'));
  const testFailedKeys = [...tupleMap.keys()].filter(key => key.startsWith('test_failed/'));

  console.log(prettyPrintFacts(matchingFacts));

  // if we have test_failed, then failed
  // if we don't have any test_passed, then also failed
  // otherwise passed
  const hasAtLeastOneFailure = _.some(testFailedKeys, key => 
    tupleMap.get(key).length !== 0);
  const hasAtLeastOnePass = _.some(testPassedKeys, key => 
    tupleMap.get(key).length !== 0);
  
  expect(hasAtLeastOneFailure).toEqual(false);
  expect(hasAtLeastOnePass).toEqual(true);
};

export {
  runDedalusTest,
}