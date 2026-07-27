'use client';

import type {
  GeminiJobExtraction,
} from '@job-app/ingestion/gemini-contracts';
import { linesToList, listToLines } from '@/lib/import/extraction-state';

export type ExtractionFieldSetter = <
  K extends keyof GeminiJobExtraction,
>(
  field: K,
  value: GeminiJobExtraction[K],
) => void;

export function TextField({
  id,
  label,
  value,
  onChange,
  editing,
  required,
  missing,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  editing: boolean;
  required?: boolean;
  missing?: boolean;
  type?: 'text' | 'url' | 'email' | 'number';
}) {
  return (
    <div className={`field${missing ? ' missing-field' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        type={type}
        value={value ?? ''}
        readOnly={!editing}
        onChange={(event) => onChange(event.target.value || null)}
        aria-invalid={missing || undefined}
        placeholder="Not provided"
      />
    </div>
  );
}

export function ListField({
  id,
  label,
  value,
  onChange,
  editing,
  hint,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  editing: boolean;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={listToLines(value)}
        readOnly={!editing}
        onChange={(event) => onChange(linesToList(event.target.value))}
        placeholder="Not provided"
        rows={5}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function numberText(value: number | null): string | null {
  return value === null ? null : String(value);
}

export function nullableNumber(value: string | null): number | null {
  return value ? Number(value) : null;
}
