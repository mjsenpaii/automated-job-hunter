import {
  AbortTaskRunError,
  logger,
  task,
} from "@trigger.dev/sdk";
import {
  CONTROLLED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH,
  CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
  ControlledPersistenceGateError,
  formatControlledPublicJobDiscoveryForLog,
  isControlledPersistenceKillSwitchEnabled,
  runControlledPublicJobDiscovery,
} from "@job-app/ingestion/discovery/orchestration";
import { publicJobDiscoveryQueue } from "./public-job-discovery-shared";

export const publicJobDiscoveryControlledPersistenceTask = task({
  id: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
  queue: publicJobDiscoveryQueue,
  retry: {
    maxAttempts: 1,
  },
  ttl: "30m",
  maxDuration: 600,
  run: async (payload: unknown, { ctx }) => {
    try {
      const result = await runControlledPublicJobDiscovery(payload, {
        environmentType: ctx.environment.type,
        taskId: ctx.task.id,
        killSwitchEnabled: isControlledPersistenceKillSwitchEnabled(
          process.env[CONTROLLED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH],
        ),
      });
      logger.log(formatControlledPublicJobDiscoveryForLog(result));
      return result;
    } catch (error) {
      if (error instanceof ControlledPersistenceGateError) {
        throw new AbortTaskRunError(error.message);
      }
      throw new AbortTaskRunError(
        "Controlled job discovery failed safely; no automatic retry will occur.",
      );
    }
  },
});
