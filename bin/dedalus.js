#!/usr/bin/env node
import commander from 'commander';

import { runFile } from '../js_src/index.js';



const { program } = commander;

program
  // .version('0.0.1')
  .description('Runs Dedalus program from provided file')
  .argument('<path>', 'path to Dedalus source file')
  .action(async (filepath) => {
    await runFile(filepath)
  });

program.parse(process.argv);