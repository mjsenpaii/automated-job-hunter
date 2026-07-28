import {
  AbortTaskRunError,
  logger,
  task,
} from "@trigger.dev/sdk";
import {
  formatPublicJobDiscoveryDryRunForLog,
  PublicJobDiscoveryValidationError,
  runPublicJobDiscoveryDryRun,
} from "@job-app/ingestion/discovery/orchestration";

export const publicJobDiscoveryDryRunTask = task({
  id: "public-job-discovery-dry-run",
  queue: {
    concurrencyLimit: 1,
  },
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 2_000,
    randomize: true,
  },
  ttl: "30m",
  maxDuration: 600,
  catchError: async ({ error }) => {
    if (
      error instanceof PublicJobDiscoveryValidationError ||
      error instanceof AbortTaskRunError
    ) {
      return { skipRetrying: true };
    }
    return {};
  },
  run: async (payload: unknown) => {
    try {
      const result = await runPublicJobDiscoveryDryRun(payload);
      logger.log(formatPublicJobDiscoveryDryRunForLog(result));
      return result;
    } catch (error) {
      if (error instanceof PublicJobDiscoveryValidationError) {
        throw new AbortTaskRunError(error.message);
      }
      throw error;
    }
  },
});
