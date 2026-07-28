import { schedules } from "@trigger.dev/sdk";
import {
  publicJobDiscoveryQueue,
  runScheduledPublicJobDiscoveryDryRun,
  shouldSkipDiscoveryRetry,
} from "./public-job-discovery-shared";

const discoveryScheduleRetry = {
  maxAttempts: 2,
  factor: 2,
  minTimeoutInMs: 500,
  maxTimeoutInMs: 2_000,
  randomize: true,
} as const;

const developmentCron = (pattern: string) => ({
  pattern,
  timezone: "Asia/Manila",
  environments: ["DEVELOPMENT"] as const,
});

export const publicJobDiscoveryMorningDryRunTask = schedules.task({
  id: "public-job-discovery-morning-dry-run",
  cron: developmentCron("0 8 * * *"),
  queue: publicJobDiscoveryQueue,
  retry: discoveryScheduleRetry,
  ttl: "30m",
  maxDuration: 600,
  catchError: async ({ error }) => {
    if (shouldSkipDiscoveryRetry(error)) {
      return { skipRetrying: true };
    }
    return {};
  },
  run: async (payload) =>
    runScheduledPublicJobDiscoveryDryRun("MORNING", payload),
});

export const publicJobDiscoveryEveningDryRunTask = schedules.task({
  id: "public-job-discovery-evening-dry-run",
  cron: developmentCron("0 19 * * *"),
  queue: publicJobDiscoveryQueue,
  retry: discoveryScheduleRetry,
  ttl: "30m",
  maxDuration: 600,
  catchError: async ({ error }) => {
    if (shouldSkipDiscoveryRetry(error)) {
      return { skipRetrying: true };
    }
    return {};
  },
  run: async (payload) =>
    runScheduledPublicJobDiscoveryDryRun("EVENING", payload),
});
