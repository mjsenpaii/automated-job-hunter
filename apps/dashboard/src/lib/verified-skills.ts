import fs from 'fs';
import path from 'path';
import type { SkillEntry } from '@job-app/core';

/**
 * Shape of an entry in `candidate/skills.verified.json` (the tracked, non-private
 * verified-skills source of truth).
 */
interface RawVerifiedSkill {
  skill: string;
  verification_status: string;
  source: string;
  source_reference: string | null;
  allowed_in_resume: boolean;
}

/**
 * Loads the candidate's verified skills for scoring.
 *
 * Scoring (`scoreJob`) only consumes `name` + `allowed_in_resume`; the remaining
 * `SkillEntry` fields are neutral, schema-valid metadata (not resume claims and not
 * used by the scorer). No skill data is fabricated — names come straight from the file.
 * Returns `[]` if the file is missing so the pipeline still runs.
 */
export function getVerifiedSkills(): SkillEntry[] {
  const filePath = path.join(process.cwd(), '../../candidate/skills.verified.json');

  let raw: RawVerifiedSkill[];
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawVerifiedSkill[];
  } catch {
    return [];
  }

  if (!Array.isArray(raw)) return [];

  return raw.map((entry): SkillEntry => ({
    name: entry.skill,
    category: 'other',
    proficiency: null,
    verification_status: 'VERIFIED',
    source: 'CV_MJ.docx',
    source_reference: entry.source_reference ?? null,
    evidence_level: 'training',
    allowed_in_resume: entry.allowed_in_resume !== false,
  }));
}
