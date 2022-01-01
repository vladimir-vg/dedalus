#!/usr/bin/env node
import commander from 'commander';

import { runFile, validateFile } from '../js_src/index.js';
import { prettyPrintFacts } from '../js_src/prettyprint.js';



const { program } = commander;

program
  .command('validate')
  .description('Only parses and validates Dedalus source file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    const facts = await validateFile(filepath);
    console.log(prettyPrintFacts(facts));
  });

program
  .command('run')
  .description('Runs Dedalus program from provided file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    await runFile(filepath)
  });

program.parse(process.argv);