import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fixedEveningPublicJobDiscoveryDryRunPayload,
  fixedMorningPublicJobDiscoveryDryRunPayload,
} from "../../../src/trigger/public-job-discovery-shared";

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

  it("routes both schedules through the shared helper", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain(
      'runScheduledPublicJobDiscoveryDryRun("MORNING", payload)',
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

  it("uses ttl 30m and maximum 2 attempts", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).toContain('ttl: "30m"');
    expect(scheduled).toContain("maxAttempts: 2");
  });

  it("does not create imperative schedules", () => {
    const scheduled = source(scheduledTaskFile);
    expect(scheduled).not.toMatch(/schedules\.create\(/);
  });

  it("stays dry-run and does not create persistence or applications", () => {
    const shared = source(sharedFile);
    expect(shared).toContain("runPublicJobDiscoveryDryRun(");
    expect(shared).toContain("fixedPayloadForSchedule");
    expect(shared).not.toMatch(/--apply|apply:\s*true|persistBatch|applicationsCreated:\s*[1-9]/);
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

  it("contains no Gemini or shell execution usage", () => {
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
