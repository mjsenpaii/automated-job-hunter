import {
  AbortTaskRunError,
  logger,
  queue,
} from "@trigger.dev/sdk";
import {
  formatPublicJobDiscoveryDryRunForLog,
  PublicJobDiscoveryValidationError,
  type PublicJobDiscoveryDryRunPayload,
  runPublicJobDiscoveryDryRun,
} from "@job-app/ingestion/discovery/orchestration";

export const publicJobDiscoveryQueue = queue({
  name: "public-job-discovery-dry-runs",
  concurrencyLimit: 1,
});

const baseFixedPayload = {
  arbeitnowEnabled: true,
  remotiveEnabled: true,
  leverEnabled: true,
  query: "",
  category: "",
  remoteOnly: true,
  arbeitnowLimit: 50,
  remotiveLimit: 50,
  leverLimit: 50,
  leverCompanies: ["spotify", "highspot", "aleph"],
  cacheStrategy: "FRESH",
  confirmRecentlyExhausted: false,
} as const;

export type PublicJobDiscoveryScheduleLabel = "MORNING" | "EVENING";

export const fixedMorningPublicJobDiscoveryDryRunPayload: PublicJobDiscoveryDryRunPayload =
  {
    ...baseFixedPayload,
    scheduleGroup: "MORNING",
    profileIds: ["software_development", "ai_automation"],
    category: "software-dev",
  };

export const fixedEveningPublicJobDiscoveryDryRunPayload: PublicJobDiscoveryDryRunPayload =
  {
    ...baseFixedPayload,
    scheduleGroup: "EVENING",
    profileIds: ["ai_augmented_development", "low_code_no_code"],
  };

export function fixedPayloadForSchedule(
  scheduleLabel: PublicJobDiscoveryScheduleLabel,
): PublicJobDiscoveryDryRunPayload {
  return scheduleLabel === "MORNING"
    ? fixedMorningPublicJobDiscoveryDryRunPayload
    : fixedEveningPublicJobDiscoveryDryRunPayload;
}

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
  const fixedPayload = fixedPayloadForSchedule(scheduleLabel);
  const result = await runPublicJobDiscoveryDryRun(
    fixedPayload,
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
