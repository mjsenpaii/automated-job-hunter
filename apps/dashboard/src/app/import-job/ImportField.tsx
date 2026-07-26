'use client';

export function displayOrFallback(value: string | null | undefined, fallback: string): string {
  const t = value?.trim();
  return t ? t : fallback;
}

type ImportFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  invalid?: boolean;
  error?: string;
  hint?: string;
  type?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export function ImportField({
  id,
  label,
  value,
  onChange,
  required,
  invalid,
  error,
  hint,
  type = 'text',
  inputRef,
}: ImportFieldProps) {
  const errId = `${id}-err`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={error ? errId : undefined}
        className={invalid ? 'invalid' : undefined}
        required={required}
      />
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p id={errId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
