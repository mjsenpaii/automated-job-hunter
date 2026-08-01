import { getDb } from '@job-app/db/connection';
import {
  defaultDatabasePath,
  defaultSkillsPath,
  loadVerifiedSkills,
} from '../discovery/runtime.js';
import {
  createSqliteWebDiscoveryStore,
  resolveWebDiscoveryQuotaCaps,
} from '../discovery/web-discovery-store.js';
import { resolveGeminiSearchModel } from '../adapters/gemini-web-search.server.js';
import { resolveFreelanceDiscoveryConfiguration } from './configuration.js';
import { createFreelanceRepository } from './repository.js';
import type { FreelanceScanDependencies } from './scan.js';

export function createFreelanceScanDependencies(options: {
  environmentType: string;
  taskId: string;
  runId: string;
  environment?: Readonly<Record<string, string | undefined>>;
  databasePath?: string;
}): FreelanceScanDependencies {
  const environment = options.environment ?? process.env;
  const databasePath = options.databasePath ?? defaultDatabasePath();
  return {
    environmentType: options.environmentType,
    taskId: options.taskId,
    runId: options.runId,
    configuration: resolveFreelanceDiscoveryConfiguration(environment),
    repository: createFreelanceRepository(getDb(databasePath)),
    verifiedSkills: loadVerifiedSkills(defaultSkillsPath()),
    webStore: createSqliteWebDiscoveryStore(databasePath),
    webCaps: resolveWebDiscoveryQuotaCaps(environment),
    tavilyApiKey: environment.TAVILY_API_KEY ?? '',
    geminiApiKey: environment.GEMINI_API_KEY ?? '',
    geminiSearchModel: resolveGeminiSearchModel(environment.GEMINI_SEARCH_MODEL),
  };
}
