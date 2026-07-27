'use client';

import type {
  EnrichedGeminiJobExtraction,
  GeminiJobExtraction,
} from '@job-app/ingestion/gemini-contracts';
import {
  nullableNumber,
  numberText,
  TextField,
  type ExtractionFieldSetter,
} from './ExtractionControls';

const WORK_SETUP_OPTIONS: Array<{
  value: NonNullable<GeminiJobExtraction['workSetup']>;
  label: string;
}> = [
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'ONSITE', label: 'Onsite' },
  { value: 'TEMPORARY_REMOTE', label: 'Temporary remote' },
  { value: 'UNCLEAR', label: 'Unclear' },
];

export function ExtractionOverviewFields({
  id,
  extraction,
  editing,
  set,
}: {
  id: string;
  extraction: EnrichedGeminiJobExtraction;
  editing: boolean;
  set: ExtractionFieldSetter;
}) {
  return (
    <div className="review-field-grid">
      <TextField
        id={`${id}-title`}
        label="Job title"
        value={extraction.title}
        onChange={(value) => set('title', value)}
        editing={editing}
        required
        missing={!extraction.title}
      />
      <TextField
        id={`${id}-company`}
        label="Company"
        value={extraction.company}
        onChange={(value) => set('company', value)}
        editing={editing}
        required
        missing={!extraction.company}
      />
      <TextField
        id={`${id}-source-site`}
        label="Source site"
        value={extraction.sourceSite}
        onChange={(value) => set('sourceSite', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-source-url`}
        label="Source URL"
        value={extraction.sourceUrl}
        onChange={(value) => set('sourceUrl', value)}
        editing={editing}
        type="url"
      />
      <TextField
        id={`${id}-location`}
        label="Location"
        value={extraction.location}
        onChange={(value) => set('location', value)}
        editing={editing}
        required
        missing={!extraction.location && !extraction.country}
      />
      <TextField
        id={`${id}-country`}
        label="Country / eligibility region"
        value={extraction.country}
        onChange={(value) => set('country', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-city`}
        label="City"
        value={extraction.city}
        onChange={(value) => set('city', value)}
        editing={editing}
      />
      <div className="field">
        <label htmlFor={`${id}-work-setup`}>Work setup *</label>
        <select
          id={`${id}-work-setup`}
          value={extraction.workSetup ?? ''}
          disabled={!editing}
          aria-invalid={!extraction.workSetup || undefined}
          onChange={(event) => {
            const selected =
              WORK_SETUP_OPTIONS.find(
                (option) => option.value === event.target.value,
              )?.value ?? null;
            set('workSetup', selected);
          }}
        >
          <option value="">Not provided</option>
          {WORK_SETUP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <TextField
        id={`${id}-employment`}
        label="Employment type"
        value={extraction.employmentType}
        onChange={(value) => set('employmentType', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-salary`}
        label="Salary"
        value={extraction.salaryText}
        onChange={(value) => set('salaryText', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-salary-min`}
        label="Salary minimum"
        value={numberText(extraction.salaryMin)}
        onChange={(value) => set('salaryMin', nullableNumber(value))}
        editing={editing}
        type="number"
      />
      <TextField
        id={`${id}-salary-max`}
        label="Salary maximum"
        value={numberText(extraction.salaryMax)}
        onChange={(value) => set('salaryMax', nullableNumber(value))}
        editing={editing}
        type="number"
      />
      <TextField
        id={`${id}-salary-currency`}
        label="Salary currency"
        value={extraction.salaryCurrency}
        onChange={(value) => set('salaryCurrency', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-salary-grade`}
        label="Salary grade"
        value={numberText(extraction.salaryGrade)}
        onChange={(value) => set('salaryGrade', nullableNumber(value))}
        editing={editing}
        type="number"
      />
      <TextField
        id={`${id}-salary-step`}
        label="Salary step"
        value={numberText(extraction.salaryStep)}
        onChange={(value) => set('salaryStep', nullableNumber(value))}
        editing={editing}
        type="number"
      />
      <TextField
        id={`${id}-hours`}
        label="Hours per week"
        value={numberText(extraction.hoursPerWeek)}
        onChange={(value) => set('hoursPerWeek', nullableNumber(value))}
        editing={editing}
        type="number"
      />
      <TextField
        id={`${id}-posted`}
        label="Date posted"
        value={extraction.datePosted}
        onChange={(value) => set('datePosted', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-updated`}
        label="Date updated"
        value={extraction.dateUpdated}
        onChange={(value) => set('dateUpdated', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-closing`}
        label="Closing date"
        value={extraction.closingDate}
        onChange={(value) => set('closingDate', value)}
        editing={editing}
      />
      <TextField
        id={`${id}-vacancies`}
        label="Vacancies"
        value={numberText(extraction.vacancies)}
        onChange={(value) => set('vacancies', nullableNumber(value))}
        editing={editing}
        type="number"
      />
      <TextField
        id={`${id}-schedule`}
        label="Timezone / schedule"
        value={extraction.timezoneOrSchedule}
        onChange={(value) => set('timezoneOrSchedule', value)}
        editing={editing}
      />
      <div className="field">
        <label htmlFor={`${id}-government-scope`}>Government scope</label>
        <select
          id={`${id}-government-scope`}
          value={extraction.governmentScope ?? ''}
          disabled={!editing}
          onChange={(event) => {
            const value = event.target.value;
            set(
              'governmentScope',
              value === 'NATIONAL_GOVERNMENT' ||
                value === 'LOCAL_GOVERNMENT' ||
                value === 'UNKNOWN'
                ? value
                : null,
            );
          }}
        >
          <option value="">Not provided</option>
          <option value="NATIONAL_GOVERNMENT">National government</option>
          <option value="LOCAL_GOVERNMENT">Local government</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </div>
      {extraction.salaryReferenceMin !== null &&
        extraction.salaryReferenceMax !== null && (
          <div className="banner banner-info">
            <span>
              <strong>
                {extraction.salaryReferenceScheduleYear} DBM reference:{' '}
                {new Intl.NumberFormat('en-PH', {
                  style: 'currency',
                  currency: 'PHP',
                  maximumFractionDigits: 0,
                }).format(extraction.salaryReferenceMin)}
                –
                {new Intl.NumberFormat('en-PH', {
                  style: 'currency',
                  currency: 'PHP',
                  maximumFractionDigits: 0,
                }).format(extraction.salaryReferenceMax)}{' '}
                per month
              </strong>
              <small>
                Reference only and non-guaranteed.{' '}
                {extraction.compensationNote}
              </small>
            </span>
          </div>
        )}
    </div>
  );
}
