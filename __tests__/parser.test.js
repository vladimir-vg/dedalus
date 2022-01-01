import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import { parseDedalus } from '../js_src/index.js';
import { factsFromAst, clearLineNumbersFromAst } from '../js_src/ast.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wrapTable = (pairs) => {
  return pairs.map(([key, arr]) =>
    [key, expect.arrayContaining(arr)])
};



const testcases = [
  ['choose'],
  ['broadcast'],
  ['lamport_clock'],
  ['various'],
];
test.each(testcases)('%s', async (name) => {
  const inputPath = path.join(__dirname, `./parser/${name}.in.dedalus`);
  const outputPath = path.join(__dirname, `./parser/${name}.out.dedalus`);

  const inputText = await fs.readFile(inputPath);
  const outputText = await fs.readFile(outputPath);
  const inputAst = await parseDedalus(inputText, `./parser/${name}.in.dedalus`);
  const outputAst = await parseDedalus(outputText, `./parser/${name}.out.dedalus`);
  const inputAstWithoutLines = clearLineNumbersFromAst(inputAst);
  const expectedFacts = factsFromAst(outputAst, 0);   

  // in order to match tables using jest, wrap all tuples
  // with expect.arrayContaining, 

  const received = Object.fromEntries(wrapTable([...inputAstWithoutLines]));
  const expected = Object.fromEntries([...expectedFacts]);
  expect(received).toMatchObject(expected);
});

