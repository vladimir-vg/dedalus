#!/usr/bin/env node
import commander from 'commander';
import fs from 'fs/promises';

import { runFile, validateFile } from '../js_src/index.js';
import { prettyPrintFacts } from '../js_src/prettyprint.js';



const { program } = commander;

program
  .command('validate')
  .description('Only parses and validates Dedalus source file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    const sourceDedalusText = await fs.readFile(filepath);
    const facts = await validateFile(sourceDedalusText, filepath);
    console.log(prettyPrintFacts(facts));
  });

program
  .command('run')
  .description('Runs Dedalus program from provided file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    const dedalusText = await fs.readFile(filepath);
    const facts = await runFile(dedalusText, filepath);
    console.log(prettyPrintFacts(facts));
  });

program.parse(process.argv);