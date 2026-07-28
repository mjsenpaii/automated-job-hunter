import type { LeverCompany } from './lever-companies.v1.js';
import { LEVER_COMPANIES } from './lever-companies.v1.js';

export class LeverCompanySelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeverCompanySelectionError';
  }
}

export function resolveLeverCompanies(
  requested: string[],
  configuredCompanies: LeverCompany[] = LEVER_COMPANIES,
): LeverCompany[] {
  const companies = requested.map((requestedValue) => {
    if (
      /^https?:\/\//i.test(requestedValue) ||
      requestedValue.includes('/')
    ) {
      throw new LeverCompanySelectionError(
        'Lever company selection does not accept URLs or arbitrary hosts.',
      );
    }
    const normalized = requestedValue.trim().toLocaleLowerCase();
    const company = configuredCompanies.find(
      (configured) =>
        configured.site.toLocaleLowerCase() === normalized ||
        configured.displayName.toLocaleLowerCase() === normalized,
    );
    if (!company || !company.enabled) {
      throw new LeverCompanySelectionError(
        `Unknown or disabled Lever company: ${requestedValue}`,
      );
    }
    return company;
  });
  const uniqueCompanies = [
    ...new Map(
      companies.map((company) => [
        company.site.toLocaleLowerCase(),
        company,
      ]),
    ).values(),
  ];
  if (uniqueCompanies.length > 10) {
    throw new LeverCompanySelectionError(
      'A Lever discovery run supports at most ten companies.',
    );
  }
  return uniqueCompanies;
}
