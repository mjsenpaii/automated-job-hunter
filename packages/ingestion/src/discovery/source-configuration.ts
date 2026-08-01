export const PUBLIC_JOB_DISCOVERY_SOURCE_IDS = [
  'tavily',
  'arbeitnow',
  'remotive',
  'lever',
] as const;

export type PublicJobDiscoverySourceId =
  (typeof PUBLIC_JOB_DISCOVERY_SOURCE_IDS)[number];

export const PUBLIC_JOB_DISCOVERY_SOURCE_ENV = {
  tavily: 'JOB_DISCOVERY_TAVILY_ENABLED',
  arbeitnow: 'JOB_DISCOVERY_ARBEITNOW_ENABLED',
  remotive: 'JOB_DISCOVERY_REMOTIVE_ENABLED',
  lever: 'JOB_DISCOVERY_LEVER_ENABLED',
} as const satisfies Record<PublicJobDiscoverySourceId, string>;

export const PUBLIC_JOB_DISCOVERY_WEB_FEATURE_ENV = {
  geminiSearch: 'JOB_DISCOVERY_GEMINI_SEARCH_ENABLED',
  tavilyExtract: 'JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED',
  deepScan: 'JOB_DISCOVERY_DEEP_SCAN_ENABLED',
} as const;

export interface PublicJobDiscoverySourceConfiguration {
  tavily: boolean;
  geminiSearch: boolean;
  tavilyExtract: boolean;
  deepScan: boolean;
  arbeitnow: boolean;
  remotive: boolean;
  lever: boolean;
}

export function isExactDiscoverySourceSwitchEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

/**
 * The single server-side source-selection boundary used by every shared
 * discovery flow. Callers may inject an allowlisted environment view in tests;
 * no value is ever returned or exposed to clients.
 */
export function resolvePublicJobDiscoverySourceConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PublicJobDiscoverySourceConfiguration {
  return {
    tavily: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_SOURCE_ENV.tavily],
    ),
    geminiSearch: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_WEB_FEATURE_ENV.geminiSearch],
    ),
    tavilyExtract: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_WEB_FEATURE_ENV.tavilyExtract],
    ),
    deepScan: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_WEB_FEATURE_ENV.deepScan],
    ),
    arbeitnow: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_SOURCE_ENV.arbeitnow],
    ),
    remotive: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_SOURCE_ENV.remotive],
    ),
    lever: isExactDiscoverySourceSwitchEnabled(
      environment[PUBLIC_JOB_DISCOVERY_SOURCE_ENV.lever],
    ),
  };
}

export function hasEnabledDiscoverySource(
  configuration: PublicJobDiscoverySourceConfiguration,
): boolean {
  return configuration.tavily || configuration.geminiSearch ||
    PUBLIC_JOB_DISCOVERY_SOURCE_IDS
      .filter((source) => source !== 'tavily')
      .some((source) => configuration[source]);
}
