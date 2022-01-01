#!/usr/bin/env node
import commander from 'commander';

import { runFile, validateFile } from '../js_src/index.js';



const { program } = commander;

program
  .command('validate')
  .description('Only parses and validates Dedalus source file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    await validateFile(filepath);
  });

program
  .command('run')
  .description('Runs Dedalus program from provided file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    await runFile(filepath)
  });

program.parse(process.argv);