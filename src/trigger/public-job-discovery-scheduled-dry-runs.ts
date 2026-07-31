import { logger, schedules } from "@trigger.dev/sdk";
import {
  formatControlledPublicJobDiscoveryForLog,
  isScheduledPersistenceKillSwitchEnabled,
  runScheduledMorningPublicJobDiscoveryPersistence,
  SCHEDULED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH,
} from "@job-app/ingestion/discovery/orchestration";
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
  retry: {
    maxAttempts: 1,
  },
  ttl: "30m",
  maxDuration: 600,
  catchError: async ({ error }) => {
    if (shouldSkipDiscoveryRetry(error)) {
      return { skipRetrying: true };
    }
    return {};
  },
  run: async (payload, { ctx }) => {
    const scheduledPersistenceEnabled =
      ctx.environment.type === "DEVELOPMENT" &&
      isScheduledPersistenceKillSwitchEnabled(
        process.env[SCHEDULED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH],
      );
    if (!scheduledPersistenceEnabled) {
      return runScheduledPublicJobDiscoveryDryRun("MORNING", payload);
    }
    const scheduledAt =
      payload.timestamp instanceof Date
        ? payload.timestamp
        : payload.timestamp
          ? new Date(payload.timestamp)
          : new Date();
    const result = await runScheduledMorningPublicJobDiscoveryPersistence({
      environmentType: ctx.environment.type,
      killSwitchEnabled: true,
      taskId: ctx.task.id,
      now: () => scheduledAt,
    });
    logger.log(formatControlledPublicJobDiscoveryForLog(result));
    return result;
  },
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
