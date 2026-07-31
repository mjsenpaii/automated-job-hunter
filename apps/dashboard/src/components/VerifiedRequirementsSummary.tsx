'use client';

import type {
  ExtractionAggregateStatus,
  VerificationStatus,
  VerifiedJobRequirementsExtraction,
  VerifiedQualification,
  VerifiedTextFact,
} from '@job-app/ingestion/job-requirements-contracts';

type DisplayVerificationStatus = VerificationStatus | ExtractionAggregateStatus;

export function getUserFacingRequirementReviewMessages(
  extraction: VerifiedJobRequirementsExtraction,
): Array<{ key: string; message: string }> {
  const messages = new Map<string, string>();
  for (const item of extraction.reviewItems) {
    if (item.audience !== 'USER') continue;
    const key = item.category === 'SALARY'
      ? 'SALARY'
      : [
          item.candidateId,
          item.category,
          item.normalizedLabel ?? '',
          item.reasonCode,
        ].join(':');
    const message = item.category === 'SALARY'
      ? 'Salary range detected, but currency or pay period requires review.'
      : `${item.normalizedLabel ?? 'Structured requirement'} needs review.`;
    if (!messages.has(key)) messages.set(key, message);
  }
  return [...messages].map(([key, message]) => ({ key, message }));
}

function statusLabel(status: DisplayVerificationStatus): string {
  return status.replace(/_/g, ' ');
}

function VerificationPill({ status }: { status: DisplayVerificationStatus }) {
  return (
    <span
      className={`verification-pill verification-${status.toLowerCase().replace(/_/g, '-')}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function Evidence({
  quote,
  section,
  source,
  affectedScoring,
}: {
  quote: string | null;
  section: string | null;
  source: string;
  affectedScoring: boolean;
}) {
  return (
    <div className="verified-evidence">
      {quote && <q>{quote}</q>}
      <span>
        {source.replace(/_/g, ' ')}
        {section ? ` · ${section}` : ''}
        {affectedScoring ? ' · Used in scoring' : ' · Review only'}
      </span>
    </div>
  );
}

function QualificationList({
  title,
  items,
  empty,
}: {
  title: string;
  items: VerifiedQualification[];
  empty: string;
}) {
  return (
    <section className="verified-requirement-group">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted-copy">{empty}</p>
      ) : (
        <ul className="verified-fact-list">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <div className="verified-fact-heading">
                <strong>{item.name}</strong>
                <VerificationPill status={item.status} />
              </div>
              <Evidence
                quote={item.evidence?.quote ?? null}
                section={item.evidence?.section ?? null}
                source={item.source}
                affectedScoring={item.affectedScoring}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TextFact({
  label,
  fact,
}: {
  label: string;
  fact: VerifiedTextFact;
}) {
  if (fact.status === 'MISSING' && fact.value === null) return null;
  return (
    <li>
      <div className="verified-fact-heading">
        <strong>
          {label}: {fact.value ?? 'Not verified'}
        </strong>
        <VerificationPill status={fact.status} />
      </div>
      <Evidence
        quote={fact.evidence?.quote ?? null}
        section={fact.evidence?.section ?? null}
        source={fact.source}
        affectedScoring={fact.affectedScoring}
      />
    </li>
  );
}

export function VerifiedRequirementsSummary({
  extraction,
}: {
  extraction: VerifiedJobRequirementsExtraction;
}) {
  const experience = extraction.experienceRequirements;
  const salary = extraction.salary;
  const verifiedSalary =
    salary.currencyStatus === 'VERIFIED' &&
    salary.minimumStatus === 'VERIFIED' &&
    salary.currency &&
    salary.minimum !== null
      ? `${salary.currency} ${salary.minimum.toLocaleString()}${
          salary.maximum !== null
            ? `–${salary.maximum.toLocaleString()}`
            : ''
        }${salary.period ? ` per ${salary.period.toLowerCase()}` : ''}${
          salary.additionalCompensation.length
            ? ` plus ${salary.additionalCompensation.join(', ')}`
            : ''
        }`
      : null;
  const reviewItems = getUserFacingRequirementReviewMessages(extraction);

  return (
    <section className="verified-requirements" aria-labelledby="verified-requirements-title">
      <div className="verified-requirements-header">
        <div>
          <p className="eyebrow">Evidence-verified extraction</p>
          <h2 id="verified-requirements-title">Job requirements</h2>
        </div>
        <VerificationPill status={extraction.extractionStatus} />
      </div>

      <div className="verified-requirement-grid">
        <section className="verified-requirement-group">
          <h3>Required experience</h3>
          {experience.length === 0 ? (
            <p className="muted-copy">No evidenced experience requirement.</p>
          ) : (
            <ul className="verified-fact-list">
              {experience.map((item, index) => (
                <li key={`${item.minimumYears}-${index}`}>
                  <div className="verified-fact-heading">
                    <strong>
                      {item.minimumYears ?? 'Unresolved'}
                      {item.maximumYears !== null
                        ? `–${item.maximumYears}`
                        : '+'}{' '}
                      years · {item.requirementType ?? 'Type unresolved'}
                    </strong>
                    <VerificationPill status={item.status} />
                  </div>
                  <Evidence
                    quote={item.evidence?.quote ?? null}
                    section={item.evidence?.section ?? null}
                    source={item.source}
                    affectedScoring={item.affectedScoring}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="verified-requirement-group">
          <h3>Salary</h3>
          <div className="verified-fact-heading">
            <strong>{verifiedSalary ?? 'No verified salary'}</strong>
            <VerificationPill status={salary.status} />
          </div>
          <Evidence
            quote={salary.evidence?.quote ?? null}
            section={salary.evidence?.section ?? null}
            source={salary.source}
            affectedScoring={salary.affectedScoring}
          />
          {salary.minimum !== null && (
            <p className="muted-copy">
              Currency {statusLabel(salary.currencyStatus)} Â· minimum{' '}
              {statusLabel(salary.minimumStatus)} Â· maximum{' '}
              {statusLabel(salary.maximumStatus)} Â· period{' '}
              {statusLabel(salary.periodStatus)} Â· additional compensation{' '}
              {statusLabel(salary.additionalCompensationStatus)}
            </p>
          )}
          {salary.period === null && salary.minimum !== null && (
            <p className="muted-copy">Pay period was not explicitly verified.</p>
          )}
        </section>
      </div>

      <QualificationList
        title="Required qualifications"
        items={extraction.requiredQualifications}
        empty="No evidenced required qualifications."
      />
      <QualificationList
        title="Preferred qualifications"
        items={extraction.preferredQualifications}
        empty="No evidenced preferred qualifications."
      />

      <div className="verified-requirement-grid">
        <QualificationList
          title="Degree requirements"
          items={extraction.degreeRequirements}
          empty="No evidenced degree requirement."
        />
        <QualificationList
          title="Certification requirements"
          items={extraction.certifications}
          empty="No evidenced certification requirement."
        />
        <QualificationList
          title="Language requirements"
          items={extraction.languages}
          empty="No evidenced language requirement."
        />
        <section className="verified-requirement-group">
          <h3>Employment and work setup</h3>
          <ul className="verified-fact-list">
            <TextFact
              label="Employment type"
              fact={extraction.employmentType}
            />
            <TextFact
              label="Work setup"
              fact={extraction.workArrangement.setup}
            />
            {extraction.workArrangement.geographicRestrictions.map(
              (fact, index) => (
                <TextFact
                  key={`restriction-${index}`}
                  label="Restriction"
                  fact={fact}
                />
              ),
            )}
            <TextFact
              label="Collaboration timezone"
              fact={extraction.workArrangement.collaborationTimezone}
            />
          </ul>
          {extraction.workArrangement.setup.status === 'MISSING' &&
            extraction.workArrangement.geographicRestrictions.length === 0 &&
            extraction.workArrangement.collaborationTimezone.status ===
              'MISSING' && (
              <p className="muted-copy">
                No evidenced work-arrangement restriction.
              </p>
          )}
        </section>
      </div>

      <QualificationList
        title="Timezone and schedule requirements"
        items={extraction.workArrangement.scheduleRequirements}
        empty="No evidenced schedule requirement."
      />

      {reviewItems.length > 0 && (
        <section className="verified-requirement-group verified-review-box">
          <h3>Missing or conflicting information</h3>
          <ul>
            {reviewItems.map((item) => (
              <li key={item.key}>{item.message}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
