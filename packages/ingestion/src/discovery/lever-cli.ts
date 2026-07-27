#!/usr/bin/env node

import { runLeverCli } from './cli.js';

const result = await runLeverCli(process.argv.slice(2));
process.exitCode = result.exitCode;
