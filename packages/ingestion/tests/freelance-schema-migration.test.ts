import { createDatabase } from '@job-app/db/connection';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createLegacyFreelanceDatabase(databasePath: string): void {
  const sqlite = new Database(databasePath);
  sqlite.exec(`
    CREATE TABLE freelance_opportunities (
      id TEXT PRIMARY KEY,
      identity_key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      source_identifier TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      title TEXT NOT NULL,
      client_or_company TEXT NOT NULL,
      description_hash TEXT NOT NULL,
      public_description TEXT NOT NULL,
      published_at TEXT,
      expires_at TEXT,
      client_country TEXT,
      geographic_restrictions TEXT NOT NULL,
      timezone_restrictions TEXT NOT NULL,
      remote INTEGER,
      contract_type TEXT NOT NULL,
      pay_kind TEXT NOT NULL,
      original_currency TEXT,
      budget_min REAL,
      budget_max REAL,
      pay_period TEXT,
      stated_hourly_min REAL,
      stated_hourly_max REAL,
      estimated_effective_hourly_rate REAL,
      pay_classification TEXT NOT NULL,
      pay_evidence_label TEXT,
      required_skills TEXT NOT NULL,
      preferred_skills TEXT NOT NULL,
      minimum_experience_years INTEGER,
      seniority TEXT NOT NULL,
      category_hints TEXT NOT NULL,
      views TEXT NOT NULL,
      readiness TEXT NOT NULL,
      readiness_json TEXT NOT NULL,
      scam_risk TEXT NOT NULL,
      scam_risk_reasons TEXT NOT NULL,
      ranking_score INTEGER NOT NULL,
      status TEXT NOT NULL,
      preparation_state TEXT NOT NULL,
      preparation_json TEXT NOT NULL,
      manual_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX freelance_opportunities_status_idx
      ON freelance_opportunities (status);
    CREATE INDEX freelance_opportunities_readiness_idx
      ON freelance_opportunities (readiness);
    CREATE INDEX freelance_opportunities_risk_idx
      ON freelance_opportunities (scam_risk);
    CREATE INDEX freelance_opportunities_ranking_idx
      ON freelance_opportunities (ranking_score);
    CREATE INDEX freelance_opportunities_pay_idx
      ON freelance_opportunities (pay_classification);
  `);
  sqlite.prepare(`
    INSERT INTO freelance_opportunities (
      id, identity_key, source, source_identifier, canonical_url, title,
      client_or_company, description_hash, public_description,
      geographic_restrictions, timezone_restrictions, contract_type, pay_kind,
      pay_classification, required_skills, preferred_skills, seniority,
      category_hints, views, readiness, readiness_json, scam_risk,
      scam_risk_reasons, ranking_score, status, preparation_state,
      preparation_json
    ) VALUES (
      @id, @identityKey, 'MANUAL', 'legacy-source',
      'https://client.example/legacy-project', 'Legacy project',
      'Legacy client', @descriptionHash, 'Public project description',
      '[]', '[]', 'PROJECT', 'UNKNOWN', 'UNKNOWN', '[]', '[]', '[]', '[]',
      '[]', 'NOT_READY', '{}', 'LOW', '[]', 0, 'NEW', 'NOT_STARTED', '{}'
    )
  `).run({
    id: 'legacy-opportunity',
    identityKey: '1'.repeat(64),
    descriptionHash: '2'.repeat(64),
  });
  sqlite.close();
}

describe('freelance additive schema migration', () => {
  it('atomically upgrades the early table shape and preserves existing rows', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'freelance-schema-'));
    tempDirectories.push(directory);
    const databasePath = path.join(directory, 'app.db');
    createLegacyFreelanceDatabase(databasePath);

    const first = createDatabase(databasePath);
    const columns = first.prepare(
      `PRAGMA table_info('freelance_opportunities')`,
    ).all() as Array<{ name: string; notnull: number }>;
    for (const name of [
      'semantic_identity_key',
      'opportunity_categories',
      'ethics_compliance_status',
    ]) {
      expect(columns.find((column) => column.name === name)?.notnull).toBe(1);
    }
    const migrated = first.prepare(`
      SELECT identity_key, semantic_identity_key, opportunity_categories,
        ethics_compliance_status
      FROM freelance_opportunities
      WHERE id = 'legacy-opportunity'
    `).get() as Record<string, string>;
    expect(migrated).toEqual({
      identity_key: '1'.repeat(64),
      semantic_identity_key: '1'.repeat(64),
      opportunity_categories: '[]',
      ethics_compliance_status: 'REQUIRES_REVIEW',
    });
    const semanticIndexes = first.prepare(`
      SELECT index_list.name
      FROM pragma_index_list('freelance_opportunities') AS index_list
      JOIN pragma_index_info(index_list.name) AS index_info
      WHERE index_list.[unique] = 1
        AND index_info.name = 'semantic_identity_key'
    `).all();
    expect(semanticIndexes).toHaveLength(1);
    first.close();

    const second = createDatabase(databasePath);
    expect(second.prepare(
      `SELECT COUNT(*) AS count FROM freelance_opportunities`,
    ).get()).toEqual({ count: 1 });
    expect(second.pragma('integrity_check', { simple: true })).toBe('ok');
    second.close();
  });
});
