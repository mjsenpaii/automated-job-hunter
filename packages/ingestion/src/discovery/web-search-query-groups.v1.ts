import type { JobSearchProfileId } from './job-search-profiles.v1.js';

export const WEB_SEARCH_QUERY_GROUP_VERSION = 1 as const;
export const WEB_SEARCH_QUERY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

export const WEB_SEARCH_QUERY_GROUP_IDS = [
  'ENTRY_LEVEL_SOFTWARE',
  'MOBILE_BACKEND',
  'AI_WORKFLOW_AUTOMATION',
  'DIRECT_EMPLOYER_ATS',
] as const;
export type WebSearchQueryGroupId =
  (typeof WEB_SEARCH_QUERY_GROUP_IDS)[number];

export interface WebSearchIntent {
  id: string;
  label: string;
  tavilyQuery: string;
  geminiPromptIntent: string;
}

export interface WebSearchQueryGroup {
  id: WebSearchQueryGroupId;
  label: string;
  intents: readonly WebSearchIntent[];
}

function intent(
  group: string,
  index: number,
  label: string,
  tavilyQuery = label,
): WebSearchIntent {
  return {
    id: `${group}-${String(index + 1).padStart(2, '0')}`,
    label,
    tavilyQuery,
    geminiPromptIntent: label,
  };
}

export const WEB_SEARCH_QUERY_GROUPS: readonly WebSearchQueryGroup[] = [
  {
    id: 'ENTRY_LEVEL_SOFTWARE',
    label: 'Entry-level software development',
    intents: [
      'remote junior software developer Philippines',
      'entry-level backend developer APAC',
      'junior full-stack developer remote',
      'junior web application developer remote',
      'associate software engineer remote',
      'graduate software developer remote',
      'software developer Philippines work from home',
      'remote developer accepting Philippines applicants',
    ].map((value, index) => intent('entry', index, value)),
  },
  {
    id: 'MOBILE_BACKEND',
    label: 'Mobile and backend development',
    intents: [
      'remote Android engineer APAC',
      'junior Android developer remote',
      'mobile application developer remote',
      'Node.js backend developer remote',
      'TypeScript backend engineer remote',
      'API integration developer remote',
      'Java backend developer remote',
      'remote software engineer worldwide',
    ].map((value, index) => intent('mobile', index, value)),
  },
  {
    id: 'AI_WORKFLOW_AUTOMATION',
    label: 'AI and workflow automation',
    intents: [
      'remote AI automation engineer',
      'n8n automation developer jobs',
      'Zapier automation specialist remote',
      'Make.com automation developer jobs',
      'workflow automation engineer remote',
      'AI agent developer remote',
      'LLM application developer remote',
      'LangChain automation developer jobs',
    ].map((value, index) => intent('automation', index, value)),
  },
  {
    id: 'DIRECT_EMPLOYER_ATS',
    label: 'Direct employer and ATS job pages',
    intents: [
      intent(
        'direct',
        0,
        'relevant public Lever job postings',
        'remote software developer automation jobs site:jobs.lever.co',
      ),
      intent(
        'direct',
        1,
        'relevant public Greenhouse job postings',
        'remote software developer automation jobs site:boards.greenhouse.io OR site:job-boards.greenhouse.io',
      ),
      intent(
        'direct',
        2,
        'relevant public Ashby job postings',
        'remote software developer automation jobs site:jobs.ashbyhq.com',
      ),
      intent(
        'direct',
        3,
        'relevant public Workable job postings',
        'remote software developer automation jobs site:apply.workable.com',
      ),
      intent('direct', 4, 'direct employer careers software developer remote'),
      intent('direct', 5, 'direct employer careers Android engineer remote'),
      intent('direct', 6, 'direct employer careers AI automation remote'),
      intent(
        'direct',
        7,
        'public remote engineering vacancies accepting APAC applicants',
      ),
    ],
  },
] as const;

export interface QueryGroupExecution {
  queryGroupId: WebSearchQueryGroupId;
  executedAt: string;
}

export interface QueryGroupSelection {
  queryGroup: WebSearchQueryGroup;
  recentlyExhausted: boolean;
  requiresFreshConfirmation: boolean;
}

function stableSeed(
  philippineDate: string,
  activeProfileIds: readonly JobSearchProfileId[],
): number {
  const input = `${philippineDate}:${[...activeProfileIds].sort().join(',')}`;
  let value = 2166136261;
  for (const character of input) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function validExecution(
  execution: QueryGroupExecution,
): execution is QueryGroupExecution {
  return WEB_SEARCH_QUERY_GROUP_IDS.includes(execution.queryGroupId) &&
    !Number.isNaN(Date.parse(execution.executedAt));
}

export function selectDeterministicQueryGroup(options: {
  philippineDate: string;
  activeProfileIds: readonly JobSearchProfileId[];
  executions: readonly QueryGroupExecution[];
  now: Date;
  cacheStrategy: 'CACHED' | 'FRESH';
  confirmRecentlyExhausted?: boolean;
}): QueryGroupSelection {
  const executions = options.executions
    .filter(validExecution)
    .sort((left, right) =>
      Date.parse(left.executedAt) - Date.parse(right.executedAt),
    );
  const mostRecent = executions.at(-1);
  const initialIndex = stableSeed(
    options.philippineDate,
    options.activeProfileIds,
  ) % WEB_SEARCH_QUERY_GROUPS.length;

  if (options.cacheStrategy === 'CACHED') {
    const selectedId = mostRecent?.queryGroupId ??
      WEB_SEARCH_QUERY_GROUPS[initialIndex]!.id;
    return {
      queryGroup: WEB_SEARCH_QUERY_GROUPS.find(
        (group) => group.id === selectedId,
      )!,
      recentlyExhausted: false,
      requiresFreshConfirmation: false,
    };
  }

  const lastIndex = mostRecent
    ? WEB_SEARCH_QUERY_GROUPS.findIndex(
        (group) => group.id === mostRecent.queryGroupId,
      )
    : (initialIndex + WEB_SEARCH_QUERY_GROUPS.length - 1) %
      WEB_SEARCH_QUERY_GROUPS.length;
  const mostRecentByGroup = new Map<WebSearchQueryGroupId, number>();
  for (const execution of executions) {
    mostRecentByGroup.set(
      execution.queryGroupId,
      Date.parse(execution.executedAt),
    );
  }
  const eligibleBefore = options.now.getTime() - WEB_SEARCH_QUERY_CACHE_TTL_MS;
  for (let offset = 1; offset <= WEB_SEARCH_QUERY_GROUPS.length; offset += 1) {
    const group = WEB_SEARCH_QUERY_GROUPS[
      (lastIndex + offset) % WEB_SEARCH_QUERY_GROUPS.length
    ]!;
    const executedAt = mostRecentByGroup.get(group.id);
    if (executedAt === undefined || executedAt <= eligibleBefore) {
      return {
        queryGroup: group,
        recentlyExhausted: false,
        requiresFreshConfirmation: false,
      };
    }
  }

  const oldest = [...WEB_SEARCH_QUERY_GROUPS].sort((left, right) => {
    const leftTime = mostRecentByGroup.get(left.id) ?? 0;
    const rightTime = mostRecentByGroup.get(right.id) ?? 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return WEB_SEARCH_QUERY_GROUP_IDS.indexOf(left.id) -
      WEB_SEARCH_QUERY_GROUP_IDS.indexOf(right.id);
  })[0]!;
  return {
    queryGroup: oldest,
    recentlyExhausted: true,
    requiresFreshConfirmation: options.confirmRecentlyExhausted !== true,
  };
}
