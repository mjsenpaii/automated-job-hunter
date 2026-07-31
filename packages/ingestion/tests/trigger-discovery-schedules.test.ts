import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fixedEveningPublicJobDiscoveryDryRunPayload,
  fixedMorningPublicJobDiscoveryDryRunPayload,
} from "../../../src/trigger/public-job-discovery-shared";
import { fixedPublicJobDiscoveryPayloadForSchedule } from "../src/discovery/orchestration.js";

const scheduledTaskFile = path.resolve(
  __dirname,
  "../../../src/trigger/public-job-discovery-scheduled-dry-runs.ts",
);
const sharedFile = path.resolve(
  __dirname,
  "../../../src/trigger/public-job-discovery-shared.ts",
);
const manualTaskFile = path.resolve(
  __dirname,
  "../../../src/trigger/public-job-discovery-dry-run.ts",
);
const controlledTaskFile = path.resolve(
  __dirname,
  "../../../src/trigger/public-job-discovery-controlled-persistence.ts",
);

function source(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("Trigger.dev discovery schedules", () => {
  it("uses exact morning and evening cron patterns", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain('cron: developmentCron("0 8 * * *")');
    expect(scheduled).toContain('cron: developmentCron("0 19 * * *")');
  });

  it("uses Asia/Manila timezone and DEVELOPMENT only", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain('timezone: "Asia/Manila"');
    expect(scheduled).toContain('environments: ["DEVELOPMENT"]');
    expect(scheduled).not.toMatch(/PRODUCTION|STAGING|PREVIEW/);
  });

  it("uses fixed morning profile payload values", () => {
    expect(fixedMorningPublicJobDiscoveryDryRunPayload).toEqual({
      arbeitnowEnabled: true,
      remotiveEnabled: true,
      leverEnabled: true,
      query: "",
      category: "software-dev",
      remoteOnly: true,
      arbeitnowLimit: 50,
      remotiveLimit: 50,
      leverLimit: 50,
      leverCompanies: ["spotify", "highspot", "aleph"],
      scheduleGroup: "MORNING",
      profileIds: ["software_development", "ai_automation"],
    });
  });

  it("uses fixed evening profile payload values", () => {
    expect(fixedEveningPublicJobDiscoveryDryRunPayload).toEqual({
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
      scheduleGroup: "EVENING",
      profileIds: ["ai_augmented_development", "low_code_no_code"],
    });
  });

  it("routes morning through its gated persistence path and evening through the dry-run helper", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain(
      'runScheduledPublicJobDiscoveryDryRun("MORNING", payload)',
    );
    expect(scheduled).toContain(
      "runScheduledMorningPublicJobDiscoveryPersistence({",
    );
    expect(scheduled).toContain(
      'runScheduledPublicJobDiscoveryDryRun("EVENING", payload)',
    );
  });

  it("keeps the existing manual task available", () => {
    const manual = source(manualTaskFile);
    expect(manual).toContain('id: "public-job-discovery-dry-run"');
  });

  it("shares one queue with concurrency limit 1", () => {
    const shared = source(sharedFile);
    const scheduled = source(scheduledTaskFile);
    const manual = source(manualTaskFile);
    expect(shared).toContain('name: "public-job-discovery-dry-runs"');
    expect(shared).toContain("concurrencyLimit: 1");
    expect(scheduled).toContain("queue: publicJobDiscoveryQueue");
    expect(manual).toContain("queue: publicJobDiscoveryQueue");
  });

  it("uses ttl 30m, one morning attempt, and bounded evening dry-run retries", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain('ttl: "30m"');
    expect(scheduled).toContain("maxAttempts: 1");
    expect(scheduled).toContain("maxAttempts: 2");
  });

  it("does not create imperative schedules", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).not.toMatch(/schedules\.create\(/);
  });

  it("keeps shared dry-run execution free of persistence and applications", () => {
    const shared = source(sharedFile);
    expect(shared).toContain("runPublicJobDiscoveryDryRun(");
    expect(shared).toContain("fixedPayloadForSchedule");
    expect(shared).not.toMatch(/--apply|apply:\s*true|persistBatch|applicationsCreated:\s*[1-9]/);
  });

  it("keeps evening dry-run-only while morning uses an independent exact switch", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain(
      'runScheduledPublicJobDiscoveryDryRun("MORNING", payload)',
    );
    expect(scheduled).toContain(
      'runScheduledPublicJobDiscoveryDryRun("EVENING", payload)',
    );
    expect(scheduled).toContain(
      "SCHEDULED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH",
    );
    expect(scheduled).toContain(
      "process.env[SCHEDULED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH]",
    );
    const eveningDefinition = scheduled.slice(
      scheduled.indexOf(
        "export const publicJobDiscoveryEveningDryRunTask",
      ),
    );
    expect(eveningDefinition).toContain(
      'runScheduledPublicJobDiscoveryDryRun("EVENING", payload)',
    );
    expect(eveningDefinition).not.toMatch(
      /CONTROLLED|runScheduledMorningPublicJobDiscoveryPersistence|process\.env|persistControlledBatch/,
    );
  });

  it("defines a separate unscheduled controlled task with one attempt", () => {
    const controlled = source(controlledTaskFile);
    expect(controlled).toContain(
      "CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID",
    );
    expect(controlled).toContain("queue: publicJobDiscoveryQueue");
    expect(controlled).toContain("maxAttempts: 1");
    expect(controlled).toContain('ttl: "30m"');
    expect(controlled).toContain("maxDuration: 600");
    expect(controlled).toContain("ctx.environment.type");
    expect(controlled).toContain(
      "CONTROLLED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH",
    );
    expect(controlled).not.toMatch(/schedules\.task|cron:/);
  });

  it("uses different intended retrieval hints by schedule group", () => {
    expect(fixedMorningPublicJobDiscoveryDryRunPayload.category).toBe(
      "software-dev",
    );
    expect(fixedEveningPublicJobDiscoveryDryRunPayload.category).toBe("");
    expect(fixedMorningPublicJobDiscoveryDryRunPayload.profileIds).not.toEqual(
      fixedEveningPublicJobDiscoveryDryRunPayload.profileIds,
    );
  });

  it("keeps controlled schedule-group discovery inputs in parity with cron inputs", () => {
    expect(
      fixedPublicJobDiscoveryPayloadForSchedule("MORNING"),
    ).toEqual(fixedMorningPublicJobDiscoveryDryRunPayload);
    expect(
      fixedPublicJobDiscoveryPayloadForSchedule("EVENING"),
    ).toEqual(fixedEveningPublicJobDiscoveryDryRunPayload);
  });

  it("retains temporary snapshot safety boundary", () => {
    const orchestration = source(
      path.resolve(
        __dirname,
        "../src/discovery/orchestration.ts",
      ),
    );
    expect(orchestration).toContain("createDryRunRepositorySession");
    expect(orchestration).toContain("dryRunSession.cleanup()");
    expect(orchestration).toContain("finally");
  });

  it("contains no direct Gemini SDK or shell execution usage", () => {
    const aggregate = [
      source(sharedFile),
      source(scheduledTaskFile),
      source(manualTaskFile),
    ].join("\n");
    expect(aggregate).not.toMatch(
      /@google\/genai|GEMINI_API_KEY|extractJobWithGemini|child_process|spawn\(|exec\(|powershell|pnpm\s+discovery/,
    );
  });

  it("logs only safe formatted summaries", () => {
    const shared = source(sharedFile);
    expect(shared).toContain("formatPublicJobDiscoveryDryRunForLog");
    expect(shared).toContain("Public discovery schedule:");
    expect(shared).not.toMatch(/descriptionBody|headers|authorization|api[_-]?key/i);
  });

  it("supports manual schedule test runs without schedule payload fields", () => {
    const shared = source(sharedFile);
    expect(shared).toContain("payload.timestamp instanceof Date");
    expect(shared).toContain('payload.timezone ?? "Asia/Manila"');
  });
});
