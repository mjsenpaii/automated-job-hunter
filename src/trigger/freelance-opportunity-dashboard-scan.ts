import { AbortTaskRunError, logger, task } from '@trigger.dev/sdk';
import { FREELANCE_SCAN_TASK_ID } from '@job-app/ingestion/freelance/contracts';
import { createFreelanceScanDependencies } from '@job-app/ingestion/freelance/runtime';
import {
  FreelanceScanGateError,
  runFreelanceOpportunityScan,
} from '@job-app/ingestion/freelance/scan';
import { publicJobDiscoveryQueue } from './public-job-discovery-shared';

export const freelanceOpportunityDashboardScanTask = task({
  id: FREELANCE_SCAN_TASK_ID,
  queue: publicJobDiscoveryQueue,
  retry: { maxAttempts: 1 },
  ttl: '2h',
  maxDuration: 3600,
  run: async (payload: unknown, { ctx }) => {
    try {
      const result = await runFreelanceOpportunityScan(
        payload,
        createFreelanceScanDependencies({
          environmentType: ctx.environment.type,
          taskId: ctx.task.id,
          runId: ctx.run.id,
        }),
      );
      logger.log('Freelance opportunity scan completed safely.', {
        runId: result.runId,
        mode: result.mode,
        status: result.status,
        unique: result.unique,
        saved: result.savedThisRun,
      });
      return result;
    } catch (error) {
      if (error instanceof FreelanceScanGateError) {
        throw new AbortTaskRunError(error.message);
      }
      throw new AbortTaskRunError(
        'Freelance opportunity scan failed safely; no automatic retry will occur.',
      );
    }
  },
});
