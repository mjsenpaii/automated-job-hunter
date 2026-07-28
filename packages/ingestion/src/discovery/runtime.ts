import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillEntry } from '@job-app/core';
import { getDb, getReadonlyDb, openReadonlyDatabaseSession } from '@job-app/db/connection';
import { z } from 'zod';
import type { DiscoveryOptions, DiscoveryRepository } from './contracts.js';
import { createDiscoveryRepository } from './repository.js';

export const DISCOVERY_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

export function resolveDiscoveryRepositoryRoot(): string {
  const cwd = process.cwd();
  if (
    fs.existsSync(path.join(cwd, 'candidate', 'skills.verified.json')) ||
    fs.existsSync(path.join(cwd, 'data', 'app.db'))
  ) {
    return cwd;
  }
  return DISCOVERY_REPOSITORY_ROOT;
}

const RawVerifiedSkillSchema = z.object({
  skill: z.string().trim().min(1),
  verification_status: z.string(),
  source: z.string(),
  source_reference: z.string().nullable(),
  allowed_in_resume: z.boolean(),
});

export function defaultDatabasePath(
  root: string = resolveDiscoveryRepositoryRoot(),
): string {
  return path.join(root, 'data', 'app.db');
}

export function defaultSkillsPath(
  root: string = resolveDiscoveryRepositoryRoot(),
): string {
  return path.join(root, 'candidate', 'skills.verified.json');
}

export function loadVerifiedSkills(filePath: string): SkillEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(
      'Unable to read the verified-skills source required for scoring.',
    );
  }
  const parsed = RawVerifiedSkillSchema.array().safeParse(json);
  if (!parsed.success) {
    throw new Error('The verified-skills source has an unexpected shape.');
  }
  return parsed.data.map(
    (entry): SkillEntry => ({
      name: entry.skill,
      category: 'other',
      proficiency: null,
      verification_status: 'VERIFIED',
      source: 'CV_MJ.docx',
      source_reference: entry.source_reference,
      evidence_level: 'training',
      allowed_in_resume: entry.allowed_in_resume,
    }),
  );
}

export function createDiscoveryRepositoryForRun(
  options: Pick<DiscoveryOptions, 'apply'>,
  databasePath: string,
): DiscoveryRepository {
  if (options.apply) {
    return createDiscoveryRepository(getDb(databasePath));
  }
  if (!fs.existsSync(databasePath)) {
    return {
      async loadExistingJobs() {
        return [];
      },
      async persistBatch() {
        throw new Error('Dry-run repository cannot persist jobs.');
      },
    };
  }
  return createDiscoveryRepository(getReadonlyDb(databasePath));
}

export function copyDatabaseSnapshot(
  databasePath: string,
  destinationDir: string,
): string {
  fs.mkdirSync(destinationDir, { recursive: true });
  const snapshotPath = path.join(destinationDir, path.basename(databasePath));
  fs.copyFileSync(databasePath, snapshotPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${databasePath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.copyFileSync(sidecar, `${snapshotPath}${suffix}`);
    }
  }
  return snapshotPath;
}

export interface DryRunRepositorySession {
  repository: DiscoveryRepository;
  cleanup(): void;
}

export function createDryRunRepositorySession(
  databasePath: string,
  tempDirectoryFactory: () => string = () =>
    fs.mkdtempSync(path.join(os.tmpdir(), 'job-discovery-readonly-')),
): DryRunRepositorySession {
  if (!fs.existsSync(databasePath)) {
    return {
      repository: {
        async loadExistingJobs() {
          return [];
        },
        async persistBatch() {
          throw new Error('Dry-run repository cannot persist jobs.');
        },
      },
      cleanup() {},
    };
  }

  const snapshotDir = tempDirectoryFactory();
  const snapshotPath = copyDatabaseSnapshot(databasePath, snapshotDir);
  const session = openReadonlyDatabaseSession(snapshotPath);
  return {
    repository: createDiscoveryRepository(session.database),
    cleanup() {
      session.close();
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    },
  };
}
