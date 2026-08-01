import { z } from 'zod';

export const GeminiSearchProviderFailureCategorySchema = z.enum([
  'API_KEY_MISSING',
  'AUTHENTICATION_FAILED',
  'MODEL_NOT_FOUND',
  'MODEL_NOT_AVAILABLE_FOR_ACCOUNT',
  'GOOGLE_SEARCH_TOOL_UNSUPPORTED',
  'FREE_TIER_OR_BILLING_RESTRICTION',
  'RATE_LIMITED',
  'DAILY_QUOTA_EXHAUSTED',
  'INVALID_REQUEST_SHAPE',
  'SDK_VERSION_INCOMPATIBLE',
  'RESPONSE_SCHEMA_MISMATCH',
  'SAFETY_BLOCKED',
  'NETWORK_FAILURE',
  'TIMEOUT',
  'UNKNOWN_PROVIDER_FAILURE',
]);

export type GeminiSearchProviderFailureCategory = z.infer<
  typeof GeminiSearchProviderFailureCategorySchema
>;
