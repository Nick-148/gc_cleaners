/** Accessible form controls: visible labels, hint + error wired via aria-describedby. */
import type { ComponentChildren } from 'preact';

interface BaseProps {
  id: string;
  label: ComponentChildren;
  error?: string | undefined;
  hint?: ComponentChildren;
  optional?: boolean;
}

function describedBy(id: string, hint: unknown, error: string | undefined): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Label({
  id,
  label,
  optional,
}: {
  id: string;
  label: ComponentChildren;
  optional?: boolean | undefined;
}) {
  return (
    <label class="field__label" htmlFor={id}>
      {label}
      {optional && <span class="field__optional"> (optional)</span>}
    </label>
  );
}

export function FieldError({ id, error }: { id: string; error?: string | undefined }) {
  if (!error) return null;
  return (
    <p class="field__error" id={`${id}-error`}>
      <span aria-hidden="true">⚠</span>
      {error}
    </p>
  );
}

function Hint({ id, hint }: { id: string; hint?: ComponentChildren }) {
  return hint ? (
    <p class="field__hint" id={`${id}-hint`}>
      {hint}
    </p>
  ) : null;
}

interface InputProps extends BaseProps {
  value: string;
  onValue: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'number';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  maxLength?: number;
  min?: number;
  max?: number;
}

export function TextField({
  id,
  label,
  error,
  hint,
  optional,
  value,
  onValue,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  min,
  max,
}: InputProps) {
  return (
    <div class="field">
      <Label id={id} label={label} optional={optional} />
      <Hint id={id} hint={hint} />
      {type === 'number' ? (
        <input
          id={id}
          name={id}
          class="input"
          type="number"
          value={value}
          onInput={(e) => {
            onValue(e.currentTarget.value);
          }}
          inputMode={inputMode}
          min={min}
          max={max}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(id, hint, error)}
          required={!optional}
        />
      ) : (
        <input
          // Preact 11 types inputs as a union discriminated by `type`, so narrow it per literal.
          {...(type === 'email'
            ? { type: 'email' as const }
            : type === 'tel'
              ? { type: 'tel' as const }
              : { type: 'text' as const })}
          id={id}
          name={id}
          class="input"
          value={value}
          onInput={(e) => {
            onValue(e.currentTarget.value);
          }}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(id, hint, error)}
          required={!optional}
        />
      )}
      <FieldError id={id} error={error} />
    </div>
  );
}

interface TextAreaProps extends BaseProps {
  value: string;
  onValue: (value: string) => void;
  rows?: number;
  maxLength?: number;
}

export function TextArea({
  id,
  label,
  error,
  hint,
  optional,
  value,
  onValue,
  rows = 4,
  maxLength,
}: TextAreaProps) {
  return (
    <div class="field">
      <Label id={id} label={label} optional={optional} />
      <Hint id={id} hint={hint} />
      <textarea
        id={id}
        name={id}
        class="textarea"
        rows={rows}
        maxLength={maxLength}
        value={value}
        onInput={(e) => {
          onValue(e.currentTarget.value);
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        required={!optional}
      />
      <FieldError id={id} error={error} />
    </div>
  );
}

type SelectProps = BaseProps & {
  value: string;
  onValue: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  autoComplete?: string;
};

export function SelectField({
  id,
  label,
  error,
  hint,
  optional,
  value,
  onValue,
  options,
  placeholder,
  autoComplete,
}: SelectProps) {
  return (
    <div class="field">
      <Label id={id} label={label} optional={optional} />
      <Hint id={id} hint={hint} />
      <select
        id={id}
        name={id}
        class="select"
        value={value}
        onChange={(e) => {
          onValue(e.currentTarget.value);
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        required={!optional}
        autoComplete={autoComplete}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError id={id} error={error} />
    </div>
  );
}

export function Checkbox({
  id,
  checked,
  onValue,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onValue: (checked: boolean) => void;
  error?: string | undefined;
  children: ComponentChildren;
}) {
  return (
    <div class="field">
      <label class="checkbox" htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name={id}
          checked={checked}
          onChange={(e) => {
            onValue(e.currentTarget.checked);
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{children}</span>
      </label>
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Bots fill every field; humans never see this one (ADR 0006). */
export function Honeypot({ value, onValue }: { value: string; onValue: (value: string) => void }) {
  return (
    <div class="hp-field" aria-hidden="true">
      <label htmlFor="company">Company (leave blank)</label>
      <input
        id="company"
        name="company"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onInput={(e) => {
          onValue(e.currentTarget.value);
        }}
      />
    </div>
  );
}

export function FormStatusMessage({ message }: { message: string | null }) {
  return (
    <div class="form-status" role="alert" aria-live="assertive">
      {message && (
        <div class="callout callout--danger">
          <p>{message}</p>
        </div>
      )}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ComponentChildren }) {
  return (
    <button class="btn btn--block" type="submit" disabled={busy} aria-disabled={busy}>
      {busy && <span class="spinner" aria-hidden="true" />}
      {busy ? 'Sending…' : children}
    </button>
  );
}
