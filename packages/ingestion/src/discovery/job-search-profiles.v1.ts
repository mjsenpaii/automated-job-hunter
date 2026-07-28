import { z } from 'zod';

/**
 * Versioned Job Search Profiles (v1).
 *
 * Pure TypeScript + Zod only — safe for server/view-model import.
 * Do not import Node, database, or Trigger.dev modules into this file.
 */

export const JobSearchScheduleGroupSchema = z.enum(['MORNING', 'EVENING']);
export type JobSearchScheduleGroup = z.infer<
  typeof JobSearchScheduleGroupSchema
>;

export const JOB_SEARCH_PROFILE_IDS = [
  'software_development',
  'ai_automation',
  'ai_augmented_development',
  'low_code_no_code',
] as const;

export const JobSearchProfileIdSchema = z.enum(JOB_SEARCH_PROFILE_IDS);
export type JobSearchProfileId = z.infer<typeof JobSearchProfileIdSchema>;

export const JobSearchProfileSchema = z
  .object({
    id: JobSearchProfileIdSchema,
    displayName: z.string().trim().min(1),
    description: z.string().trim().min(1),
    enabled: z.boolean(),
    positiveTitlePhrases: z.array(z.string().trim().min(1)).min(1),
    positiveGeneralKeywords: z.array(z.string().trim().min(1)),
    strongTechnologyKeywords: z.array(z.string().trim().min(1)),
    excludedKeywords: z.array(z.string().trim().min(1)),
    optionalSourceCategoryAliases: z.array(z.string().trim().min(1)),
    scheduleGroup: JobSearchScheduleGroupSchema,
    priority: z.number().int().positive(),
  })
  .strict();
export type JobSearchProfile = z.infer<typeof JobSearchProfileSchema>;

export const JobSearchProfilesSeedSchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(JobSearchProfileSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const profile of value.profiles) {
      if (seen.has(profile.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate job search profile ID: ${profile.id}`,
          path: ['profiles'],
        });
      }
      seen.add(profile.id);
    }
  });

export const JOB_SEARCH_PROFILES_SEED_V1 = JobSearchProfilesSeedSchema.parse({
  version: 1,
  profiles: [
    {
      id: 'software_development',
      displayName: 'Software Development',
      description:
        'Junior-friendly and general software, web, mobile, and application development roles.',
      enabled: true,
      positiveTitlePhrases: [
        'junior developer',
        'junior software engineer',
        'web developer',
        'frontend developer',
        'front-end developer',
        'backend developer',
        'back-end developer',
        'full-stack developer',
        'fullstack developer',
        'full stack developer',
        'software developer',
        'application developer',
        'mobile developer',
        'flutter developer',
        'typescript developer',
        'javascript developer',
        'php developer',
        'software engineer',
        'web engineer',
        'design systems engineer',
        'developer experience engineer',
      ],
      positiveGeneralKeywords: [
        'software development',
        'web development',
        'application development',
        'frontend',
        'front-end',
        'backend',
        'back-end',
        'full-stack',
        'fullstack',
        'mobile development',
      ],
      strongTechnologyKeywords: [
        'typescript',
        'javascript',
        'react',
        'next.js',
        'nextjs',
        'node.js',
        'nodejs',
        'php',
        'laravel',
        'flutter',
        'dart',
        'vue',
        'angular',
        'python',
        'django',
        'fastapi',
        'java',
        'spring boot',
        'c#',
        '.net',
        'golang',
        'rust',
        'kotlin',
        'swift',
        'sql',
        'postgres',
        'postgresql',
        'mysql',
        'mongodb',
        'graphql',
        'rest api',
      ],
      excludedKeywords: [
        'sales',
        'recruiter',
        'account executive',
        'customer service',
        'customer support',
        'nurse',
        'physician',
        'medical assistant',
        'accountant',
        'bookkeeper',
        'content writer',
        'copywriter',
        'communications manager',
        'marketing manager',
        'ai marketing manager',
        'content producer',
        'video editor',
        'design specialist',
        'creative producer',
        'designer',
        'hr manager',
        'human resources',
      ],
      optionalSourceCategoryAliases: [
        'software development',
        'software-dev',
        'software_dev',
        'dev',
        'development',
        'engineering',
      ],
      scheduleGroup: 'MORNING',
      priority: 1,
    },
    {
      id: 'ai_automation',
      displayName: 'AI Automation',
      description:
        'AI-assisted workflow automation, agents, RPA, and integration automation roles.',
      enabled: true,
      positiveTitlePhrases: [
        'ai automation',
        'automation specialist',
        'workflow automation',
        'automation engineer',
        'rpa developer',
        'automation developer',
        'integration automation',
        'api automation',
        'ai agent',
        'agentic workflow',
        'llm automation',
        'marketing automation engineer',
        'sales systems developer',
        'crm automation specialist',
      ],
      positiveGeneralKeywords: [
        'workflow automation',
        'ai automation',
        'agentic workflow',
        'llm automation',
        'integration automation',
        'api automation',
        'rpa',
        'process automation',
      ],
      strongTechnologyKeywords: [
        'n8n',
        'make.com',
        'zapier',
        'power automate',
        'uipath',
        'automation anywhere',
        'langchain',
        'langgraph',
        'openai api',
        'llm',
        'workflow builder',
      ],
      excludedKeywords: [
        'sales',
        'recruiter',
        'account executive',
        'customer service',
        'nurse',
        'physician',
        'accountant',
        'content writer',
        'copywriter',
        'ai marketing manager',
        'content producer',
        'video editor',
        'design specialist',
        'creative producer',
        'designer',
        'communications manager',
        'hr manager',
        'human resources',
      ],
      optionalSourceCategoryAliases: [
        'software development',
        'software-dev',
        'devops',
        'data',
        'ai',
      ],
      scheduleGroup: 'MORNING',
      priority: 2,
    },
    {
      id: 'ai_augmented_development',
      displayName: 'AI-Augmented Development',
      description:
        'AI-native and AI-assisted software development, including vibe coding aliases.',
      enabled: true,
      positiveTitlePhrases: [
        'vibe coding',
        'vibe coder',
        'ai-native developer',
        'ai native developer',
        'ai-augmented developer',
        'ai augmented developer',
        'ai-assisted developer',
        'ai assisted developer',
        'prompt-to-code',
        'prompt to code',
        'cursor developer',
        'copilot developer',
        'rapid ai prototyping',
      ],
      positiveGeneralKeywords: [
        'ai-augmented development',
        'ai augmented development',
        'ai-assisted development',
        'ai assisted development',
        'ai-assisted software development',
        'ai assisted software development',
        'ai-native development',
        'prompt-to-code',
        'prompt to code',
        'vibe coding',
        'vibe coder',
        'cursor-based development',
        'cursor based development',
        'development using cursor',
        'developer using cursor',
        'using cursor and claude code',
        'github copilot development',
        'claude code development',
        'coding-agent workflow',
        'coding agent workflow',
        'ai coding workflow',
        'rapid ai application prototyping',
        'rapid ai prototyping',
        'script automation using coding agents',
      ],
      strongTechnologyKeywords: [
        'cursor ide',
        'github copilot',
        'claude code',
        'v0',
        'bolt.new',
        'replit agent',
        'windsurf',
        'aider',
        'continue.dev',
      ],
      excludedKeywords: [
        'sales',
        'recruiter',
        'account executive',
        'customer service',
        'nurse',
        'physician',
        'accountant',
        'content writer',
        'copywriter',
        'marketing manager',
        'ai marketing manager',
        'content producer',
        'video editor',
        'design specialist',
        'creative producer',
        'designer',
        'communications manager',
        'hr manager',
        'human resources',
      ],
      optionalSourceCategoryAliases: [
        'software development',
        'software-dev',
        'ai',
      ],
      scheduleGroup: 'EVENING',
      priority: 3,
    },
    {
      id: 'low_code_no_code',
      displayName: 'Low-Code / No-Code',
      description:
        'Low-code and no-code builder, workflow, and platform developer roles.',
      enabled: true,
      positiveTitlePhrases: [
        'low-code developer',
        'low code developer',
        'no-code developer',
        'no code developer',
        'workflow builder',
        'automation builder',
        'bubble developer',
        'flutterflow developer',
        'retool developer',
        'low-code automation',
        'no-code automation',
      ],
      positiveGeneralKeywords: [
        'low-code',
        'low code',
        'no-code',
        'no code',
        'workflow builder',
        'automation builder',
        'citizen developer',
      ],
      strongTechnologyKeywords: [
        'bubble.io',
        'bubble',
        'flutterflow',
        'retool',
        'appsheet',
        'power apps',
        'powerapps',
        'adalo',
        'glide apps',
        'softr',
        'webflow',
        'airtable',
        'notion api',
      ],
      excludedKeywords: [
        'sales',
        'recruiter',
        'account executive',
        'customer service',
        'nurse',
        'physician',
        'accountant',
        'content writer',
        'copywriter',
        'marketing manager',
        'ai marketing manager',
        'content producer',
        'video editor',
        'design specialist',
        'creative producer',
        'designer',
        'communications manager',
        'hr manager',
        'human resources',
      ],
      optionalSourceCategoryAliases: [
        'software development',
        'software-dev',
        'product',
      ],
      scheduleGroup: 'EVENING',
      priority: 4,
    },
  ],
});

export const JOB_SEARCH_PROFILES_V1 = JOB_SEARCH_PROFILES_SEED_V1.profiles;

export const JobSearchProfileIdListSchema = z
  .array(JobSearchProfileIdSchema)
  .nonempty()
  .superRefine((ids, ctx) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate profile ID selection: ${id}`,
        });
      }
      seen.add(id);
    }
  });

export function getEnabledJobSearchProfiles(): JobSearchProfile[] {
  return JOB_SEARCH_PROFILES_V1.filter((profile) => profile.enabled);
}

export function getEnabledJobSearchProfileIds(): JobSearchProfileId[] {
  return getEnabledJobSearchProfiles().map((profile) => profile.id);
}

export function getProfilesForScheduleGroup(
  group: JobSearchScheduleGroup,
): JobSearchProfile[] {
  return getEnabledJobSearchProfiles()
    .filter((profile) => profile.scheduleGroup === group)
    .sort((a, b) => a.priority - b.priority);
}

export function getProfileIdsForScheduleGroup(
  group: JobSearchScheduleGroup,
): JobSearchProfileId[] {
  return getProfilesForScheduleGroup(group).map(
    (profile) => profile.id,
  );
}

export function resolveJobSearchProfileIds(
  selected: unknown,
): JobSearchProfileId[] {
  if (selected === undefined || selected === null) {
    return getEnabledJobSearchProfileIds();
  }
  return JobSearchProfileIdListSchema.parse(selected);
}

export function getJobSearchProfileDisplayName(
  id: JobSearchProfileId | 'UNTARGETED',
): string {
  if (id === 'UNTARGETED') return 'Untargeted';
  return (
    JOB_SEARCH_PROFILES_V1.find((profile) => profile.id === id)?.displayName ??
    id
  );
}

export interface ProfileMatchableJob {
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  team?: string | null;
  department?: string | null;
  employmentType?: string | null;
  requiredSkills?: string[] | null;
  preferredSkills?: string[] | null;
}

export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[_\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9.+#/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);
  if (!normalizedPhrase) return false;
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s|[.;])`).test(haystack);
}

function matchingPhrases(haystack: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => containsPhrase(haystack, phrase));
}

interface DescriptionClause {
  text: string;
  responsibilitySection: boolean;
}

interface ProfileSearchCorpus {
  title: string;
  descriptionClauses: DescriptionClause[];
  category: string;
  tags: string[];
  skills: string[];
  supportingMetadata: string[];
}

const RESPONSIBILITY_HEADING =
  /^(?:responsibilities|what you will do|what you ll do|your role|duties|key responsibilities)\s*:?\s*$/i;
const RESPONSIBILITY_HEADING_WITH_CONTENT =
  /^(?:responsibilities|what you will do|what you ll do|your role|duties|key responsibilities)\s*:\s*(.+)$/i;
const SECTION_BOUNDARY_HEADING =
  /^(?:about(?: us| [a-z0-9][a-z0-9&' -]{0,40})?|requirements|qualifications|benefits|who we are|who you are|about you|about the role|skills|experience|education|what we offer|the company|company|our product|role overview)\s*:?\s*$/i;
const HTML_HEADING_MARKER = '__job_heading__ ';

function splitSentences(value: string): string[] {
  return value
    .split(/[.;:!?]+|\r?\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const SAFE_BULLET_PREFIX =
  /^(?:[-*\u2022\u25cf\u25aa\u25e6]|\d+[.)])\s+/;

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'");
}

function normalizeDescriptionStructure(value: string): string {
  return decodeBasicHtmlEntities(value)
    .replace(/<h[1-6]\b[^>]*>/gi, `\n${HTML_HEADING_MARKER}`)
    .replace(/<\/h[1-6]\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(
      /<\/?(?:p|div|section|article|ul|ol|blockquote|tr|td|br)\b[^>]*>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n');
}

function isShortHeadingBoundary(
  rawLine: string,
  normalizedLine: string,
  isBullet: boolean,
  isHtmlHeading: boolean,
): boolean {
  if (isHtmlHeading) return true;
  if (SECTION_BOUNDARY_HEADING.test(normalizedLine)) return true;
  if (isBullet || normalizedLine.split(' ').length > 8) return false;
  if (/^[^.!?]{1,60}:\s*$/.test(rawLine)) return true;
  if (
    /^(?:you will|you['’]?ll|in this role|your responsibilities|the successful candidate|this developer|this engineer|this automation specialist)\b/i.test(
      rawLine,
    ) ||
    /^(?:build|develop|implement|maintain|write|code|test|ship|automate|create|integrate)\b/i.test(
      rawLine,
    )
  ) {
    return false;
  }
  const words = rawLine.trim().split(/\s+/);
  return (
    words.length <= 8 &&
    !/[.!?]$/.test(rawLine) &&
    words.every(
      (word) =>
        /^(?:and|or|of|the|to|for|in|with)$/i.test(word) ||
        /^[A-Z0-9][A-Za-z0-9&'’/-]*$/.test(word),
    )
  );
}

function descriptionClauses(value: string | null | undefined): DescriptionClause[] {
  if (!value?.trim()) return [];
  const clauses: DescriptionClause[] = [];
  let responsibilitySection = false;

  for (const rawLine of normalizeDescriptionStructure(value).split(/\n+/)) {
    let line = rawLine.trim();
    if (!line) continue;

    const isHtmlHeading = line.startsWith(HTML_HEADING_MARKER);
    if (isHtmlHeading) {
      line = line.slice(HTML_HEADING_MARKER.length).trim();
    }
    const isBullet = SAFE_BULLET_PREFIX.test(line);
    const normalizedHeading = normalizeSearchText(line);
    if (RESPONSIBILITY_HEADING.test(normalizedHeading)) {
      responsibilitySection = true;
      continue;
    }
    const headingWithContent = normalizedHeading.match(
      RESPONSIBILITY_HEADING_WITH_CONTENT,
    );
    if (headingWithContent?.[1]) {
      responsibilitySection = true;
      line = headingWithContent[1];
    } else if (
      isShortHeadingBoundary(
        line,
        normalizedHeading,
        isBullet,
        isHtmlHeading,
      )
    ) {
      responsibilitySection = false;
      continue;
    }

    const withoutBullet = line.replace(SAFE_BULLET_PREFIX, '').trim();
    for (const sentence of splitSentences(withoutBullet)) {
      const text = normalizeSearchText(sentence);
      if (text) {
        clauses.push({
          text,
          responsibilitySection: responsibilitySection && isBullet,
        });
      }
    }
  }

  return clauses;
}

function normalizedValues(values: readonly (string | null | undefined)[]): string[] {
  return values
    .map((value) => normalizeSearchText(value ?? ''))
    .filter(Boolean);
}

function buildSearchCorpus(job: ProfileMatchableJob): ProfileSearchCorpus {
  return {
    title: normalizeSearchText(job.title ?? ''),
    descriptionClauses: descriptionClauses(job.description),
    category: normalizeSearchText(job.category ?? ''),
    tags: normalizedValues(job.tags ?? []),
    skills: normalizedValues([
      ...(job.requiredSkills ?? []),
      ...(job.preferredSkills ?? []),
    ]),
    supportingMetadata: normalizedValues([
      job.team,
      job.department,
      job.employmentType,
    ]),
  };
}

export const ProfileMatchEvidenceTypeSchema = z.enum([
  'title_phrase',
  'title_role',
  'contextual_phrase',
  'applicant_responsibility',
  'applicant_contextual_phrase',
  'strong_technology',
  'platform',
  'source_category_alias',
  'tag',
  'skill',
]);
export type ProfileMatchEvidenceType = z.infer<
  typeof ProfileMatchEvidenceTypeSchema
>;

export const ProfileMatchEvidenceSchema = z
  .object({
    type: ProfileMatchEvidenceTypeSchema,
    value: z.string().trim().min(1).max(80),
  })
  .strict();
export type ProfileMatchEvidence = z.infer<
  typeof ProfileMatchEvidenceSchema
>;

const PRIMARY_PROFILE_EVIDENCE_TYPES = new Set<ProfileMatchEvidenceType>([
  'title_phrase',
  'title_role',
  'applicant_responsibility',
  'applicant_contextual_phrase',
]);

export const JobSearchProfileMatchSchema = z
  .object({
    profileId: JobSearchProfileIdSchema,
    evidence: z.array(ProfileMatchEvidenceSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !value.evidence.some((item) =>
        PRIMARY_PROFILE_EVIDENCE_TYPES.has(item.type),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A profile match requires primary role-intent evidence.',
        path: ['evidence'],
      });
    }
  });
export type JobSearchProfileMatch = z.infer<
  typeof JobSearchProfileMatchSchema
>;

function evidenceKey(evidence: ProfileMatchEvidence): string {
  return `${evidence.type}:${normalizeSearchText(evidence.value)}`;
}

function uniqueEvidence(
  evidence: ProfileMatchEvidence[],
): ProfileMatchEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = evidenceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface ConfiguredEvidenceRule {
  value: string;
  pattern: RegExp;
}

function configuredTitleEvidence(
  profile: JobSearchProfile,
  title: string,
): ProfileMatchEvidence[] {
  return matchingPhrases(title, profile.positiveTitlePhrases).map((value) => ({
    type: 'title_phrase',
    value,
  }));
}

const STRICT_SOFTWARE_TITLE_RULES: ConfiguredEvidenceRule[] = [
  {
    value: 'software development role',
    pattern:
      /\b(?:software|frontend|front-end|backend|back-end|full-stack|full stack|fullstack|web|application|mobile|flutter|typescript|javascript|php)\s+(?:developer|engineer)\b/,
  },
  {
    value: 'explicit software engineering role',
    pattern:
      /\b(?:design systems|developer experience|customer platform)\s+engineer\b/,
  },
  {
    value: 'software programmer role',
    pattern: /\b(?:software|web|application|systems?)\s+programmer\b/,
  },
];

const STRICT_AUTOMATION_TITLE_RULES: ConfiguredEvidenceRule[] = [
  {
    value: 'automation engineering role',
    pattern:
      /\b(?:ai |workflow |integration |marketing )?automation\s+(?:engineer|specialist|developer)\b/,
  },
  {
    value: 'rpa development role',
    pattern: /\brpa\s+(?:developer|engineer|specialist)\b/,
  },
];

const STRICT_LOW_CODE_TITLE_RULES: ConfiguredEvidenceRule[] = [
  {
    value: 'low-code development role',
    pattern:
      /\b(?:low-code|low code|no-code|no code|flutterflow|bubble|retool|appsheet|power apps|webflow)\s+(?:developer|builder|engineer)\b/,
  },
  {
    value: 'workflow builder role',
    pattern: /\b(?:workflow|automation)\s+builder\b/,
  },
];

const STRICT_AI_AUGMENTED_TITLE_RULES: ConfiguredEvidenceRule[] = [
  {
    value: 'AI-assisted development role',
    pattern:
      /\b(?:ai-augmented|ai augmented|ai-assisted|ai assisted|ai-native|ai native|cursor|copilot)\s+(?:software\s+)?developer\b/,
  },
  {
    value: 'vibe-coding role',
    pattern: /\bvibe\s+(?:coding|coder)\b/,
  },
  {
    value: 'prompt-to-code role',
    pattern: /\bprompt-to-code\b/,
  },
  {
    value: 'developer using AI coding tools',
    pattern:
      /\bdeveloper\s+(?:using|with)\s+(?:cursor|github copilot|copilot|claude code)\b/,
  },
];

const STRICT_GUARDED_TITLE_RULES: RegExp[] = [
  /\b(?:product|project|partnership|community)\s+(?:manager|coordinator)\b/,
  /\bproduct marketing\b/,
  /\bmarketing manager\b/,
  /\bcustomer success\b/,
  /\baccount manager\b/,
  /\brecruit(?:er|ing)\b/,
  /\btalent acquisition\b/,
  /\bcontent (?:producer|writer)\b/,
  /\bcopywriter\b/,
  /\bvideo editor\b/,
  /\bdesign specialist\b/,
  /\bcreative producer\b/,
  /\bdesigner\b/,
  /\bdeveloper (?:relations|advocate|evangelist)\b/,
  /\btechnical writer\b/,
  /\b(?:instructor|trainer|teacher)\b/,
  /\bsales engineer\b/,
];

const STRICT_APPLICANT_ACTOR_PREFIXES: RegExp[] = [
  /^you will (.+)$/,
  /^you ll (.+)$/,
  /^in this role you will (.+)$/,
  /^in this role you ll (.+)$/,
  /^your responsibilities include (.+)$/,
  /^the successful candidate will (.+)$/,
  /^this developer will (.+)$/,
  /^this engineer will (.+)$/,
  /^this automation specialist will (.+)$/,
];

const DIRECT_TECHNICAL_ACTIONS = [
  'build',
  'develop',
  'implement',
  'maintain',
  'write',
  'code',
  'test',
  'ship',
  'automate',
  'create',
  'integrate',
] as const;
const DIRECT_TECHNICAL_ACTION_PATTERN = DIRECT_TECHNICAL_ACTIONS.join('|');
const DIRECT_ACTION_SEQUENCE = new RegExp(
  `^(${DIRECT_TECHNICAL_ACTION_PATTERN})(?: and (${DIRECT_TECHNICAL_ACTION_PATTERN}))? (.+)$`,
);
const CLOSED_GRAMMAR_FORBIDDEN =
  /\b(?:who|that|where|while|whereas|partners?|customers?|users?|clients?|communities?|vendors?|engineers?|developers?|teams?|help|teach|support|enable|recruit|hire|market|collaborate|document)\b/;
const SOFTWARE_TECHNICAL_OBJECT =
  /^(?:(?:react|typescript|javascript|frontend|backend|mobile|web|platform|internal|production|customer-facing)\s+){0,2}(?:software|code|applications?|apps?|apis?|frontends?|backends?|components?|features?|services?|systems?|tooling|websites?)$/;
const AUTOMATION_TECHNICAL_OBJECT =
  /^(?:(?:n8n|make\.com|zapier|power automate|uipath|ai|api|crm|marketing|workflow|integration)\s+){0,2}(?:workflows?|integrations?|automations?|agents?|processes?|rpa bots?)$/;
const LOW_CODE_TECHNICAL_OBJECT =
  /^(?:flutterflow|bubble(?:\.io)?|retool|appsheet|power apps|webflow|low-code|low code|no-code|no code)\s+(?:applications?|apps?|workflows?|integrations?|automations?|solutions?)$/;
const AI_CODING_TOOL =
  '(?:cursor|claude code|github copilot|copilot|coding agents?|windsurf|aider)';
const AI_TOOL_DEVELOPMENT_PREDICATE = new RegExp(
  `^use (${AI_CODING_TOOL})(?: and (${AI_CODING_TOOL}))? to (${DIRECT_TECHNICAL_ACTION_PATTERN})(?: and (${DIRECT_TECHNICAL_ACTION_PATTERN}))? (.+)$`,
);

function strictTitleRuleEvidence(
  haystack: string,
  rules: readonly ConfiguredEvidenceRule[],
): ProfileMatchEvidence[] {
  return rules
    .filter((rule) => rule.pattern.test(haystack))
    .map((rule) => ({ type: 'title_role', value: rule.value }));
}

function applicantPredicate(clause: DescriptionClause): string | null {
  for (const pattern of STRICT_APPLICANT_ACTOR_PREFIXES) {
    const match = clause.text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return clause.responsibilitySection ? clause.text : null;
}

function matchesClosedTechnicalPredicate(
  predicate: string,
  objectPattern: RegExp,
): boolean {
  if (CLOSED_GRAMMAR_FORBIDDEN.test(predicate)) return false;
  const match = predicate.match(DIRECT_ACTION_SEQUENCE);
  if (!match?.[3]) return false;
  const object = match[3];
  return object.split(' ').length <= 6 && objectPattern.test(object);
}

function matchesClosedAiDevelopmentPredicate(predicate: string): boolean {
  if (CLOSED_GRAMMAR_FORBIDDEN.test(predicate)) return false;
  const match = predicate.match(AI_TOOL_DEVELOPMENT_PREDICATE);
  if (!match?.[5]) return false;
  const object = match[5];
  return (
    object.split(' ').length <= 6 &&
    SOFTWARE_TECHNICAL_OBJECT.test(object)
  );
}

function strictDescriptionEvidence(
  profile: JobSearchProfile,
  corpus: ProfileSearchCorpus,
): ProfileMatchEvidence[] {
  if (
    STRICT_GUARDED_TITLE_RULES.some((pattern) =>
      pattern.test(corpus.title),
    )
  ) {
    return [];
  }

  const evidence: ProfileMatchEvidence[] = [];
  for (const clause of corpus.descriptionClauses) {
    const predicate = applicantPredicate(clause);
    if (!predicate) continue;

    if (
      profile.id === 'software_development' &&
      matchesClosedTechnicalPredicate(predicate, SOFTWARE_TECHNICAL_OBJECT)
    ) {
      evidence.push({
        type: 'applicant_responsibility',
        value: 'applicant builds software',
      });
    }

    if (
      profile.id === 'ai_automation' &&
      matchesClosedTechnicalPredicate(
        predicate,
        AUTOMATION_TECHNICAL_OBJECT,
      )
    ) {
      evidence.push({
        type: 'applicant_responsibility',
        value: 'applicant builds automations',
      });
    }

    if (
      profile.id === 'low_code_no_code' &&
      matchesClosedTechnicalPredicate(
        predicate,
        LOW_CODE_TECHNICAL_OBJECT,
      )
    ) {
      evidence.push({
        type: 'applicant_responsibility',
        value: 'applicant builds low-code solutions',
      });
    }

    if (
      profile.id === 'ai_augmented_development' &&
      matchesClosedAiDevelopmentPredicate(predicate)
    ) {
      evidence.push({
        type: 'applicant_contextual_phrase',
        value: 'AI-assisted coding',
      });
    }
  }
  return uniqueEvidence(evidence);
}

function strictTitleEvidence(
  profile: JobSearchProfile,
  title: string,
): ProfileMatchEvidence[] {
  const rules =
    profile.id === 'software_development'
      ? STRICT_SOFTWARE_TITLE_RULES
      : profile.id === 'ai_automation'
        ? STRICT_AUTOMATION_TITLE_RULES
        : profile.id === 'low_code_no_code'
          ? STRICT_LOW_CODE_TITLE_RULES
          : STRICT_AI_AUGMENTED_TITLE_RULES;
  return uniqueEvidence([
    ...configuredTitleEvidence(profile, title),
    ...strictTitleRuleEvidence(title, rules),
  ]);
}

function evidenceFromSeparateValues(
  values: readonly string[],
  phrases: readonly string[],
  type: ProfileMatchEvidenceType,
): ProfileMatchEvidence[] {
  const evidence: ProfileMatchEvidence[] = [];
  for (const value of values) {
    for (const phrase of matchingPhrases(value, [...phrases])) {
      evidence.push({ type, value: phrase });
    }
  }
  return evidence;
}

function strictSupportingEvidence(
  profile: JobSearchProfile,
  corpus: ProfileSearchCorpus,
): ProfileMatchEvidence[] {
  const descriptionValues = corpus.descriptionClauses.map(
    (clause) => clause.text,
  );
  return uniqueEvidence([
    ...evidenceFromSeparateValues(
      [corpus.title, ...descriptionValues],
      profile.positiveGeneralKeywords,
      'contextual_phrase',
    ),
    ...evidenceFromSeparateValues(
      [corpus.title, ...descriptionValues, ...corpus.supportingMetadata],
      profile.strongTechnologyKeywords,
      profile.id === 'low_code_no_code'
        ? 'platform'
        : 'strong_technology',
    ),
    ...evidenceFromSeparateValues(
      corpus.tags,
      [
        ...profile.positiveGeneralKeywords,
        ...profile.strongTechnologyKeywords,
      ],
      'tag',
    ),
    ...evidenceFromSeparateValues(
      corpus.skills,
      [
        ...profile.positiveGeneralKeywords,
        ...profile.strongTechnologyKeywords,
      ],
      'skill',
    ),
    ...evidenceFromSeparateValues(
      [corpus.category],
      profile.optionalSourceCategoryAliases,
      'source_category_alias',
    ),
  ]);
}

export function isPrimaryProfileEvidence(
  evidence: ProfileMatchEvidence,
): boolean {
  return PRIMARY_PROFILE_EVIDENCE_TYPES.has(evidence.type);
}

function collectProfileEvidence(
  profile: JobSearchProfile,
  corpus: ProfileSearchCorpus,
): ProfileMatchEvidence[] {
  const guardedTitle = STRICT_GUARDED_TITLE_RULES.some((pattern) =>
    pattern.test(corpus.title),
  );
  const primaryEvidence = uniqueEvidence([
    ...(guardedTitle ? [] : strictTitleEvidence(profile, corpus.title)),
    ...strictDescriptionEvidence(profile, corpus),
  ]);
  if (primaryEvidence.length === 0) return [];
  return uniqueEvidence([
    ...primaryEvidence,
    ...strictSupportingEvidence(profile, corpus),
  ]);
}

/**
 * Deterministically match a job against active profiles with short,
 * configured evidence values. Source description passages are never returned.
 */
export function matchJobSearchProfilesWithEvidence(
  job: ProfileMatchableJob,
  activeProfileIds: readonly JobSearchProfileId[] = getEnabledJobSearchProfileIds(),
): JobSearchProfileMatch[] {
  const active = new Set(activeProfileIds);
  const corpus = buildSearchCorpus(job);

  return JOB_SEARCH_PROFILES_V1.filter(
    (profile) =>
      profile.enabled && active.has(profile.id),
  )
    .sort((a, b) => a.priority - b.priority)
    .flatMap((profile): JobSearchProfileMatch[] => {
      const evidence = collectProfileEvidence(profile, corpus);
      if (evidence.length === 0) return [];
      return [
        JobSearchProfileMatchSchema.parse({
          profileId: profile.id,
          evidence,
        }),
      ];
    });
}

/**
 * Backward-compatible ID-only matcher for dashboard filters and consumers that
 * do not need evidence.
 */
export function matchJobSearchProfiles(
  job: ProfileMatchableJob,
  activeProfileIds: readonly JobSearchProfileId[] = getEnabledJobSearchProfileIds(),
): JobSearchProfileId[] {
  return matchJobSearchProfilesWithEvidence(job, activeProfileIds).map(
    (match) => match.profileId,
  );
}

export function matchProfilesForDiscoveredJobWithEvidence(
  job: {
    title: string;
    description: string;
    category?: string | null;
    tags: string[];
    team?: string | null;
    department?: string | null;
    employmentType?: string | null;
  },
  activeProfileIds: readonly JobSearchProfileId[],
): JobSearchProfileMatch[] {
  return matchJobSearchProfilesWithEvidence(
    {
      title: job.title,
      description: job.description,
      category: job.category,
      tags: job.tags,
      team: job.team,
      department: job.department,
      employmentType: job.employmentType,
    },
    activeProfileIds,
  );
}

export function matchProfilesForDiscoveredJob(
  job: Parameters<typeof matchProfilesForDiscoveredJobWithEvidence>[0],
  activeProfileIds: readonly JobSearchProfileId[],
): JobSearchProfileId[] {
  return matchProfilesForDiscoveredJobWithEvidence(job, activeProfileIds).map(
    (match) => match.profileId,
  );
}

export function hasVibeCodingMatchEvidence(
  matches: readonly JobSearchProfileMatch[],
): boolean {
  const qualifyingValues = new Set([
    'vibe coding',
    'vibe coder',
    'vibe-coding role',
    'ai-augmented developer',
    'ai augmented developer',
    'ai-assisted developer',
    'ai assisted developer',
    'ai-native developer',
    'ai native developer',
    'prompt-to-code',
    'prompt to code',
    'cursor-based development',
    'cursor based development',
    'development using cursor',
    'developer using cursor',
    'github copilot development',
    'claude code development',
    'coding-agent workflow',
    'coding agent workflow',
    'ai coding workflow',
    'rapid ai application prototyping',
    'rapid ai prototyping',
    'script automation using coding agents',
  ]);
  return matches.some(
    (match) =>
      match.profileId === 'ai_augmented_development' &&
      match.evidence.some(
        (item) =>
          (item.type === 'title_phrase' ||
            item.type === 'applicant_contextual_phrase') &&
          qualifyingValues.has(normalizeSearchText(item.value)),
      ),
  );
}
