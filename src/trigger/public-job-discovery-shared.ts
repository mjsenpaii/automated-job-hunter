import {
  AbortTaskRunError,
  logger,
  queue,
} from "@trigger.dev/sdk";
import {
  formatPublicJobDiscoveryDryRunForLog,
  PublicJobDiscoveryValidationError,
  runPublicJobDiscoveryDryRun,
} from "@job-app/ingestion/discovery/orchestration";

export const publicJobDiscoveryQueue = queue({
  name: "public-job-discovery-dry-runs",
  concurrencyLimit: 1,
});

export const fixedPublicJobDiscoveryDryRunPayload = {
  arbeitnowEnabled: true,
  remotiveEnabled: true,
  leverEnabled: true,
  query: "developer",
  remoteOnly: true,
  arbeitnowLimit: 50,
  remotiveLimit: 50,
  leverLimit: 50,
  leverCompanies: ["spotify", "highspot", "aleph"],
} as const;

export type PublicJobDiscoveryScheduleLabel = "MORNING" | "EVENING";

export interface ScheduledPublicJobDiscoveryDryRunResult {
  scheduleLabel: PublicJobDiscoveryScheduleLabel;
  scheduledTimestamp: string;
  timezone: string;
  runCompletedAt: string;
  result: Awaited<ReturnType<typeof runPublicJobDiscoveryDryRun>>;
}

export function shouldSkipDiscoveryRetry(error: unknown): boolean {
  return (
    error instanceof PublicJobDiscoveryValidationError ||
    error instanceof AbortTaskRunError
  );
}

export async function runScheduledPublicJobDiscoveryDryRun(
  scheduleLabel: PublicJobDiscoveryScheduleLabel,
  payload: {
    timestamp?: Date | string;
    timezone?: string;
  },
): Promise<ScheduledPublicJobDiscoveryDryRunResult> {
  const scheduledAt =
    payload.timestamp instanceof Date
      ? payload.timestamp
      : payload.timestamp
        ? new Date(payload.timestamp)
        : new Date();
  const timezone = payload.timezone ?? "Asia/Manila";
  const result = await runPublicJobDiscoveryDryRun(
    fixedPublicJobDiscoveryDryRunPayload,
  );
  const runCompletedAt = new Date().toISOString();
  const safeSummary = [
    `Public discovery schedule: ${scheduleLabel}`,
    `Scheduled timestamp: ${scheduledAt.toISOString()}`,
    `Timezone: ${timezone}`,
    `Run completed at: ${runCompletedAt}`,
    formatPublicJobDiscoveryDryRunForLog(result),
  ].join("\n");
  logger.log(safeSummary);

  return {
    scheduleLabel,
    scheduledTimestamp: scheduledAt.toISOString(),
    timezone,
    runCompletedAt,
    result,
  };
}
