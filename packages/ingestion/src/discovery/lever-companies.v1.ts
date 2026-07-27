import { z } from 'zod';

export const LeverCompanySchema = z.object({
  displayName: z.string().trim().min(1),
  site: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  enabled: z.boolean(),
  notes: z.string().trim().min(1).optional(),
});
export type LeverCompany = z.infer<typeof LeverCompanySchema>;

const LeverCompanySeedSchema = z.object({
  version: z.literal(1),
  verifiedAt: z.string().date(),
  companies: z.array(LeverCompanySchema).max(10),
});

/**
 * Identifiers were verified against both a public jobs.lever.co board and the
 * official unauthenticated global Postings API on 2026-07-28.
 */
export const LEVER_COMPANY_SEED_V1 = LeverCompanySeedSchema.parse({
  version: 1,
  verifiedAt: '2026-07-28',
  companies: [
    {
      displayName: 'Spotify',
      site: 'spotify',
      enabled: true,
      notes: 'Active public company board on the global Lever host.',
    },
    {
      displayName: 'Highspot',
      site: 'highspot',
      enabled: true,
      notes: 'Active public company board on the global Lever host.',
    },
    {
      displayName: 'Aleph',
      site: 'aleph',
      enabled: true,
      notes: 'Active public company board on the global Lever host.',
    },
  ],
});

export const LEVER_COMPANIES = LEVER_COMPANY_SEED_V1.companies;

export function findLeverCompany(value: string): LeverCompany | null {
  const normalized = value.trim().toLocaleLowerCase();
  return (
    LEVER_COMPANIES.find(
      (company) =>
        company.site.toLocaleLowerCase() === normalized ||
        company.displayName.toLocaleLowerCase() === normalized,
    ) ?? null
  );
}
