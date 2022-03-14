import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';
import _ from 'lodash';

import {
  sourceFactsFromAstFacts, tree2facts, extractMetadata,
  mergeTFactsDeep,
} from './ast';
import { prettyPrintFacts, prettyPrintAST } from './prettyprint.js';
import { ast2program } from './program';

// import { Interpreter } from './naive_runtime/interpreter.js';
import { NaiveRuntime } from './naive_runtime/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const grammarPath = path.join(__dirname, 'grammar.pegjs');
const validatorPath = path.join(__dirname, '..', 'd_src', 'validator.dedalus');
const stratifierPath = path.join(__dirname, '..', 'd_src', 'stratifier.dedalus');



const parseDedalus = async (dedalusText, filename) => {
  const grammarText = await fs.readFile(grammarPath);
  const dedalusParser = peg.generate(String(grammarText));
  const tree = dedalusParser.parse(String(dedalusText));
  const astFacts = tree2facts(tree, filename);
  return astFacts;
};



const stratifyFile = async (sourceDedalusText, path) => {
  const inputAstFacts = await parseDedalus(sourceDedalusText, path);
  return stratifyFile0(inputAstFacts);
}

const stratifyFile0 = async (inputAstFacts) => {
  const stratifierDedalusText = await fs.readFile(stratifierPath);

  // stratifier must have manually computed starification in its source
  // otherwise this cause would call infinite recursion
  const { strata, astFacts, initialTFacts: initialTFacts0 } =
    await processAST(await parseDedalus(stratifierDedalusText, stratifierPath));

  let minimalTimestamp = 0;
  if (initialTFacts0.size > 0) {
    minimalTimestamp = [...initialTFacts0.keys()]
      .reduce((t1, t2) => Math.max(t1,t2), minimalTimestamp);
  }
  const inputTFacts0 = new Map([[minimalTimestamp, inputAstFacts]]);
  const inputTFacts = mergeTFactsDeep(initialTFacts0, inputTFacts0);

  const program = ast2program(astFacts);
  const rt = new NaiveRuntime(program, inputTFacts, strata);
  // debugger
  await rt.tickTillStateFixpoint();
  debugger
  return await rt.query(['stratum', 'stratum_dependency']);
};


const computeStrata = async (inputAstFacts) => {
  const facts = await stratifyFile0(inputAstFacts);


  const vertices0 = _.groupBy(
    (facts.get('stratum') ?? []).map(([s, r]) => [s['symbol'], r['symbol']]),
    ([stratum, rule]) => stratum);
  const vertices = _.mapValues(
    vertices0,
    (items) => items.map(([st, rule]) => rule));
  const edges = (facts.get('stratum_dependency') ?? [])
    .map(([s1, s2]) => [s1['symbol'], s2['symbol']]);

  return { vertices, edges };
};



const validateFile = async (sourceDedalusText, path) => {
  const inputAstFacts = await parseDedalus(sourceDedalusText, path);

  const validatorDedalusText = await fs.readFile(validatorPath);
  const { strata, astFacts, factsKeys, initialTFacts: initialTFacts0 } =
    await processAST(await parseDedalus(validatorDedalusText, validatorPath));
  
  let minimalTimestamp = 0;
  if (initialTFacts0.size > 0) {
    minimalTimestamp = [...initialTFacts0.keys()]
      .reduce((t1, t2) => Math.max(t1,t2), minimalTimestamp);
  }
  const inputTFacts0 = new Map([[minimalTimestamp, inputAstFacts]]);
  const inputTFacts = mergeTFactsDeep(initialTFacts0, inputTFacts0);

  const program = ast2program(astFacts);
  const rt = new NaiveRuntime(program, inputTFacts, strata);
  return await rt.query(factsKeys);
};



const runFile = async (dedalusText, path) => {
  throw new Error('Temporarly disabled');
};



const processAST = async (astFacts0) => {
  const { explicitStrata, astFacts } = extractMetadata(astFacts0);
  let strata = explicitStrata ?? await computeStrata(astFacts);
  const initialTFacts = sourceFactsFromAstFacts(astFacts);

  const clausesKeys = astFacts.get('ast_clause').map(t => t[0]['symbol']);
  const initialFactsKeys = [...initialTFacts].flatMap(([_timestamp, facts]) => [...facts.keys()]);
  const factsKeys = _.uniq([...clausesKeys, ...initialFactsKeys]);

  return { strata, astFacts, initialTFacts, factsKeys };
};



export {
  parseDedalus,
  runFile,
  validateFile,
  stratifyFile,
  prettyPrintFacts,
  prettyPrintAST,
  processAST,
}
