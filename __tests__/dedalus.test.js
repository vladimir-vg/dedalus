import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import glob from 'glob-promise';

import _ from 'lodash';

import { validateFile, parseDedalus, stratifyFile } from '../js_src/index.js';
import { prettyPrintFacts, prettyPrintAST, processAST } from '../js_src/index.js';

import { NaiveRuntime } from '../js_src/naive_runtime/index.ts';
import { ast2program } from '../js_src/program';
import { mergeTFactsDeep } from '../js_src/ast';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const findTestcases = async ({ blacklist, only }) => {
  const all = await glob('**/*.test.dedalus');
  const skipped = [];
  let testcases;
  if (only.length !== 0) {
    testcases = only;
  } else {
    testcases = all.filter(path => {
      if (blacklist.includes(path)) {
        skipped.push(path);
        return false;
      }
      return true;
    });
  }

  const testcaseRe = /^([a-zA-Z0-9_]+)\.test\.dedalus$/;

  // now we need to group all test cases by dirs
  const result = {};
  const testsDirs = _.uniq(all.map(path => path.split('/')[1]));
  testsDirs.forEach(dir => {
    result[dir] = {toRun: [], toSkip: []};
  });

  testcases.forEach(path => {
    const [_t, dir, filename] = path.split('/');
    result[dir].toRun.push(filename.match(testcaseRe)[1]);
  });
  skipped.forEach(path => {
    const [_t, dir, filename] = path.split('/');
    result[dir].toSkip.push(filename.match(testcaseRe)[1]);
  });

  return result;
};



const testcases = await findTestcases({
  blacklist: [
    // temporarly disabled tests, that require automatic stratification:
    // '__tests__/eval/negation.test.dedalus',
    // '__tests__/eval/var_ignored_in_negation.test.dedalus',
    '__tests__/eval/several_choose_exprs.test.dedalus',
  ],
  only: [
    // if we want to run only particular tests (e.g. for debugging)
    // then we specify them here.
    //
    // if list is empty, then everything is run as usual
    // '__tests__/eval/choice_with_next.test.dedalus',
  ],
});



describe("validator", () => {
  // just to report that there are skipped tests
  if (testcases.validator.toSkip.length != 0) {
    test.skip.each(testcases.validator.toSkip)('%s', async (name) => null);
  }

  if (testcases.validator.toRun.length == 0) { return; }
  test.each(testcases.validator.toRun)('%s', async (name) => {
    const inputPath = path.join(__dirname, `./validator/${name}.in.dedalus`);
    const matcherPath = path.join(__dirname, `./validator/${name}.test.dedalus`);
  
    const inputText = await fs.readFile(inputPath);
    const validationFacts = await validateFile(inputText, `./validator/${name}.in.dedalus`);
  
    // now when we got results of validation,
    // we need to supply them as facts and run the matcher code
  
    const matcherText = await fs.readFile(matcherPath);
    await runDedalusTest(validationFacts, matcherText, `./validator/${name}.test.dedalus`, { inputHasAST: true, noInduction: true, skipValidation: true });
  });
});



describe('parser', () => {
  // just to report that there are skipped tests
  if (testcases.parser.toSkip.length != 0) {
    test.skip.each(testcases.parser.toSkip)('%s', async (name) => null);
  }
  if (testcases.parser.toRun.length == 0) { return; }
  test.each(testcases.parser.toRun)('%s', async (name) => {
    const inputPath = path.join(__dirname, `./parser/${name}.in.dedalus`);
    const matcherPath = path.join(__dirname, `./parser/${name}.test.dedalus`);
  
    const inputText = await fs.readFile(inputPath);
    const astFacts = await parseDedalus(inputText, `./parser/${name}.in.dedalus`);
  
    // now when we got results of validation,
    // we need to supply them as facts and run the matcher code
  
    const matcherText = await fs.readFile(matcherPath);
    await runDedalusTest(astFacts, matcherText, `./parser/${name}.test.dedalus`, { inputHasAST: true, noInduction: true });
  });
});



describe("stratifier", () => {
  // just to report that there are skipped tests
  if (testcases.stratifier.toSkip.length != 0) {
    test.skip.each(testcases.stratifier.toSkip)('%s', async (name) => null);
  }

  if (testcases.stratifier.toRun.length == 0) { return; }
  test.each(testcases.stratifier.toRun)('%s', async (name) => {
    const inputPath = path.join(__dirname, `./stratifier/${name}.in.dedalus`);
    const matcherPath = path.join(__dirname, `./stratifier/${name}.test.dedalus`);
  
    const inputText = await fs.readFile(inputPath);
    const stratificationFacts = await stratifyFile(inputText, `./stratifier/${name}.in.dedalus`);
  
    // now when we got results of validation,
    // we need to supply them as facts and run the matcher code
  debugger
    const matcherText = await fs.readFile(matcherPath);
    await runDedalusTest(stratificationFacts, matcherText, `./stratifier/${name}.test.dedalus`, { noInduction: true });
  });
});



describe('eval', () => {
  // just to report that there are skipped tests
  if (testcases.eval.toSkip.length != 0) {
    test.skip.each(testcases.eval.toSkip)('%s', async (name) => null);
  }
  if (testcases.eval.toRun.length == 0) { return; }
  test.each(testcases.eval.toRun)('%s', async (name) => {
    const matcherPath = path.join(__dirname, `./eval/${name}.test.dedalus`);
    const matcherText = await fs.readFile(matcherPath);

    const inputFacts = (new Map([]));
    await runDedalusTest(inputFacts, matcherText, `./eval/${name}.test.dedalus`);
  });
});



const countUniqFacts = (facts) => {
  return [... facts.values()]
    .map(tuples => tuples.length)
    .reduce((a, b) => a+b, 0);
}


// version that uses Runtime interface
const runDedalusTest = async (inputFacts, matcherText, matcherPath, opts = {}) => {
  const { inputHasAST, noInduction, skipValidation } = opts;

  if (!skipValidation) {
    const validationFacts = await validateFile(matcherText, matcherPath);
    const validationTFacts = new Map([[0, validationFacts]]);
    if ((validationFacts.get('invalid_ast') ?? []).length !== 0) {
      console.log(`invalid AST for ${matcherPath}:\n` + prettyPrintFacts(validationTFacts));
      if (inputHasAST) {
        console.log(prettyPrintAST(validationTFacts));
      }
      throw new Error('Invalid AST in test code');
    }
  }


  const { strata, astFacts, initialTFacts: initialTFacts0, factsKeys } =
    await processAST(await parseDedalus(matcherText, matcherPath));
  
  const program = ast2program(astFacts);
  let minimalTimestamp = 0;
  if (initialTFacts0.size > 0) {
    minimalTimestamp = [...initialTFacts0.keys()]
      .reduce((t1, t2) => Math.max(t1,t2), minimalTimestamp);
  }
  const inputTFacts = new Map([[minimalTimestamp, inputFacts]]);
  const initialTFacts = mergeTFactsDeep(initialTFacts0, inputTFacts);
  const rt = new NaiveRuntime(program, initialTFacts, strata);

  const testPassedKeys = factsKeys.filter(key => key.startsWith('test_passed'));
  const testFailedKeys = factsKeys.filter(key => key.startsWith('test_failed'));

  let testFailed = false;
  let testPassed = false;
  while (true) {
    const testPassedFacts = await rt.query(testPassedKeys);
    const testFailedFacts = await rt.query(testFailedKeys);
    const hasAtLeastOnePass = (0 !== countUniqFacts(testPassedFacts));
    const hasAtLeastOneFailure = (0 !== countUniqFacts(testFailedFacts));

    const fixpointReached = await rt.isFixpointReached();
    testPassed = hasAtLeastOnePass && !hasAtLeastOneFailure;
    testFailed = (fixpointReached && !testPassed) || hasAtLeastOneFailure;
    if (noInduction) { break; }
// debugger
    if (testFailed || testPassed) { debugger; break; }

    await rt.tick();
  }

  if (testFailed || (!testPassed && noInduction)) {
    const queryKeys = [...factsKeys, 'stratum', 'stratum_dependency'];
    const allDeductedFacts = await rt.query(queryKeys);
    const currentTimestamp = rt.getCurrentTimestamp();
    const allDeductedTFacts = new Map([[currentTimestamp, allDeductedFacts]]);

    console.log(`for ${matcherPath}:\n` + prettyPrintFacts(allDeductedTFacts));
    if (inputHasAST) {
      console.log(prettyPrintAST(allDeductedTFacts))
    }
    throw new Error('Test failed');
  }
};
