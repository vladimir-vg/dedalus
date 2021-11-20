import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import peg from 'peggy';

import { tree2tables } from './ast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const grammarPath = path.join(__dirname, 'grammar.pegjs');

const runFile = async (path) => {
  const grammarText = await fs.readFile(grammarPath);
  const dedalusText = await fs.readFile(path);
  const parser = peg.generate(String(grammarText));
  const tree = parser.parse(String(dedalusText));
  console.log(tree2tables(tree, path).toJS());
};



export {
  runFile
}