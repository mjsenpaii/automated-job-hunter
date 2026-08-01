import {
  AbortTaskRunError,
  logger,
  metadata,
  task,
} from '@trigger.dev/sdk';
import {
  DASHBOARD_PUBLIC_JOB_SCAN_KILL_SWITCH,
  DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
} from '@job-app/ingestion/discovery/dashboard-scan-contracts';
import {
  DashboardJobScanGateError,
  isDashboardJobScanKillSwitchEnabled,
  runDashboardJobScan,
} from '@job-app/ingestion/discovery/dashboard-scan';
import { publicJobDiscoveryQueue } from './public-job-discovery-shared';

export const publicJobDiscoveryDashboardScanTask = task({
  id: DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
  queue: publicJobDiscoveryQueue,
  retry: { maxAttempts: 1 },
  ttl: '2h',
  maxDuration: 3600,
  run: async (payload: unknown, { ctx }) => {
    try {
      const result = await runDashboardJobScan(payload, {
        environmentType: ctx.environment.type,
        killSwitchEnabled: isDashboardJobScanKillSwitchEnabled(
          process.env[DASHBOARD_PUBLIC_JOB_SCAN_KILL_SWITCH],
        ),
        taskId: ctx.task.id,
        runId: ctx.run.id,
        onStage(stage) {
          metadata.set('dashboardScanStage', stage);
        },
      });
      logger.log('Dashboard job scan completed safely.', {
        runId: result.runId,
        mode: result.mode,
        status: result.status,
        fetched: result.fetched,
        selected: result.selected,
        persisted: result.persistedThisRun,
      });
      return result;
    } catch (error) {
      metadata.set('dashboardScanStage', 'FAILED');
      if (error instanceof DashboardJobScanGateError) {
        throw new AbortTaskRunError(error.message);
      }
      throw new AbortTaskRunError(
        'Dashboard job scan failed safely; no automatic retry will occur.',
      );
    }
  },
});
