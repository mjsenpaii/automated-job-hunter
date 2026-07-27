'use client';

import type {
  EnrichedGeminiJobExtraction,
} from '@job-app/ingestion/gemini-contracts';
import {
  ListField,
  nullableNumber,
  numberText,
  TextField,
  type ExtractionFieldSetter,
} from './ExtractionControls';

export function RequirementsReview({
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
    <div className="review-sections">
      <details open>
        <summary>Description</summary>
        <div className="field details-field">
          <label htmlFor={`${id}-description`} className="visually-hidden">
            Description
          </label>
          <textarea
            id={`${id}-description`}
            value={extraction.description ?? ''}
            readOnly={!editing}
            aria-invalid={!extraction.description || undefined}
            onChange={(event) =>
              set('description', event.target.value || null)
            }
            rows={12}
            placeholder="Description not provided"
          />
        </div>
      </details>
      <details open>
        <summary>Requirements and responsibilities</summary>
        <div className="review-field-grid">
          <ListField
            id={`${id}-requirements`}
            label="Requirements"
            value={extraction.requirements}
            onChange={(value) => set('requirements', value)}
            editing={editing}
            hint="One item per line"
          />
          <ListField
            id={`${id}-responsibilities`}
            label="Responsibilities"
            value={extraction.responsibilities}
            onChange={(value) => set('responsibilities', value)}
            editing={editing}
            hint="One item per line"
          />
          <ListField
            id={`${id}-skills`}
            label="Skills"
            value={extraction.skills}
            onChange={(value) => set('skills', value)}
            editing={editing}
            hint="One skill per line"
          />
          <TextField
            id={`${id}-civil-service-eligibility`}
            label="Civil Service eligibility"
            value={extraction.civilServiceEligibility}
            onChange={(value) => set('civilServiceEligibility', value)}
            editing={editing}
          />
          <ListField
            id={`${id}-schedule-notes`}
            label="Schedule notes"
            value={extraction.scheduleNotes}
            onChange={(value) => set('scheduleNotes', value)}
            editing={editing}
            hint="One obligation per line"
          />
          <div className="experience-fields">
            <TextField
              id={`${id}-required-years`}
              label="Required years"
              value={numberText(extraction.requiredYearsExperience)}
              onChange={(value) =>
                set('requiredYearsExperience', nullableNumber(value))
              }
              editing={editing}
              type="number"
            />
            <TextField
              id={`${id}-preferred-years`}
              label="Preferred years"
              value={numberText(extraction.preferredYearsExperience)}
              onChange={(value) =>
                set('preferredYearsExperience', nullableNumber(value))
              }
              editing={editing}
              type="number"
            />
          </div>
        </div>
      </details>
      {extraction.evidence.length > 0 && (
        <details>
          <summary>Extraction evidence</summary>
          <ul className="evidence-list">
            {extraction.evidence.map((item, index) => (
              <li key={`${item.field}-${index}`}>
                <strong>{item.field.replace(/([A-Z])/g, ' $1')}</strong>
                <span>{item.excerpts.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ApplicationReview({
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
    <div className="review-sections">
      <details open>
        <summary>Application instructions</summary>
        <ListField
          id={`${id}-application-instructions`}
          label="Instructions"
          value={extraction.applicationInstructions}
          onChange={(value) => set('applicationInstructions', value)}
          editing={editing}
          hint="One step per line"
        />
      </details>
      <div className="review-field-grid">
        <TextField
          id={`${id}-keyword`}
          label="Application keyword"
          value={extraction.applicationKeyword}
          onChange={(value) => set('applicationKeyword', value)}
          editing={editing}
        />
        <TextField
          id={`${id}-application-url`}
          label="Application URL"
          value={extraction.applicationUrl}
          onChange={(value) => set('applicationUrl', value)}
          editing={editing}
          type="url"
        />
        <TextField
          id={`${id}-application-email`}
          label="Application email"
          value={extraction.applicationEmail}
          onChange={(value) => set('applicationEmail', value)}
          editing={editing}
          type="email"
        />
        <TextField
          id={`${id}-application-addressee`}
          label="Application addressee"
          value={extraction.applicationAddressee}
          onChange={(value) => set('applicationAddressee', value)}
          editing={editing}
        />
      </div>
    </div>
  );
}

export function OriginalContentReview({
  originalContent,
}: {
  originalContent: string;
}) {
  return (
    <details className="original-content">
      <summary>Show original pasted content</summary>
      <p>
        This is the exact untrusted input for review. It was not rendered as HTML
        or followed as instructions.
      </p>
      <pre>{originalContent}</pre>
    </details>
  );
}
