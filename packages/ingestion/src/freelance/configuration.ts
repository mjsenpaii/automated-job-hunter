import {
  FREELANCE_DAILY_SAVE_LIMIT_MAX,
  FREELANCE_LEARNING_HOURS_MAX,
} from './contracts.js';

export const FREELANCE_SOURCE_SWITCHES = {
  HIMALAYAS: 'FREELANCE_SOURCE_HIMALAYAS_ENABLED',
  REMOTIVE: 'FREELANCE_SOURCE_REMOTIVE_ENABLED',
  TAVILY: 'FREELANCE_SOURCE_TAVILY_ENABLED',
  GEMINI_SEARCH: 'FREELANCE_SOURCE_GEMINI_SEARCH_ENABLED',
} as const;

export function exactTrue(value: string | undefined): boolean {
  return value === 'true';
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export interface FreelanceDiscoveryConfiguration {
  enabled: boolean;
  tavilyExtractEnabled: boolean;
  sources: {
    himalayas: boolean;
    remotive: boolean;
    tavily: boolean;
    geminiSearch: boolean;
  };
  minimumHourlyUsd: number;
  dailySaveCap: number;
  fastLearningMaxHours: number;
}

export function resolveFreelanceDiscoveryConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): FreelanceDiscoveryConfiguration {
  return {
    enabled: exactTrue(environment.JOB_DISCOVERY_FREELANCE_ENABLED),
    tavilyExtractEnabled: exactTrue(
      environment.JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED,
    ),
    sources: {
      himalayas: exactTrue(environment[FREELANCE_SOURCE_SWITCHES.HIMALAYAS]),
      remotive: exactTrue(environment[FREELANCE_SOURCE_SWITCHES.REMOTIVE]),
      tavily: exactTrue(environment[FREELANCE_SOURCE_SWITCHES.TAVILY]),
      geminiSearch: exactTrue(environment[FREELANCE_SOURCE_SWITCHES.GEMINI_SEARCH]),
    },
    minimumHourlyUsd: boundedNumber(
      environment.FREELANCE_MIN_HOURLY_USD,
      3,
      0,
      100,
    ),
    dailySaveCap: Math.trunc(boundedNumber(
      environment.FREELANCE_DAILY_SAVE_CAP,
      FREELANCE_DAILY_SAVE_LIMIT_MAX,
      1,
      FREELANCE_DAILY_SAVE_LIMIT_MAX,
    )),
    fastLearningMaxHours: Math.trunc(boundedNumber(
      environment.FREELANCE_FAST_LEARNING_MAX_HOURS,
      FREELANCE_LEARNING_HOURS_MAX,
      4,
      FREELANCE_LEARNING_HOURS_MAX,
    )),
  };
}
