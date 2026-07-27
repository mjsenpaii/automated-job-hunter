#!/usr/bin/env node

import { runRemotiveCli } from './cli.js';

const result = await runRemotiveCli(process.argv.slice(2));
process.exitCode = result.exitCode;
