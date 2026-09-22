'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const CONTROL_BASE =
  'w-full rounded-lg border bg-void/60 px-3 text-sm text-ink transition-colors placeholder:text-muted-soft focus:border-creme/40 focus:bg-void focus:outline-none disabled:opacity-60';

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldWrapper({ label, hint, error, children }: FieldWrapperProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs leading-relaxed text-[#f2a9ac]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, className = '', ...props }: TextFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          {...props}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${CONTROL_BASE} h-11 ${error ? 'border-sondravo-red/60' : 'border-line'} ${className}`}
        />
      )}
    </FieldWrapper>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({ label, hint, error, className = '', children, ...props }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <div className="relative">
          <select
            {...props}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={`${CONTROL_BASE} h-11 appearance-none pr-9 ${error ? 'border-sondravo-red/60' : 'border-line'} ${className}`}
          >
            {children}
          </select>
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </FieldWrapper>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextAreaField({ label, hint, error, className = '', ...props }: TextAreaFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <textarea
          {...props}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${CONTROL_BASE} min-h-24 resize-y py-2.5 leading-relaxed ${error ? 'border-sondravo-red/60' : 'border-line'} ${className}`}
        />
      )}
    </FieldWrapper>
  );
}
