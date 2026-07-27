#!/usr/bin/env node

import { runArbeitnowCli } from './cli.js';

const result = await runArbeitnowCli(process.argv.slice(2));
process.exitCode = result.exitCode;
