import type { RefObject } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { z } from 'zod';
import { fieldErrors } from '../../../shared/schemas';
import { ApiClientError, errorMessage } from './api';

export type FormStatus =
  { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

export const CLIENT_VALIDATION_MESSAGE = 'Please fix the highlighted fields and try again.';

/**
 * Minimal form state for the public forms: values, per-field errors, a status message
 * (announced by an aria-live region) and focus management to the first invalid field.
 */
export interface FormApi<T extends Record<string, unknown>> {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  setValues: (update: T | ((current: T) => T)) => void;
  errors: Record<string, string>;
  setErrors: (
    update: Record<string, string> | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  status: FormStatus;
  setStatus: (status: FormStatus) => void;
  formRef: RefObject<HTMLFormElement | null>;
  /** Validates with the shared schema; on failure shows errors and returns null. */
  check: <S extends z.ZodType>(schema: S, payload: unknown) => z.output<S> | null;
  fail: (fields: Record<string, string>, message: string) => void;
  failFromError: (error: unknown) => void;
}

export function useForm<T extends Record<string, unknown>>(initial: T): FormApi<T> {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });
  const formRef = useRef<HTMLFormElement>(null);

  const focusFirstError = useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(
          ':is(input, select, textarea)[aria-invalid="true"]:not(:disabled), [data-invalid="true"]:not(:disabled)',
        )
        ?.focus();
    });
  }, []);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key as string]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const fail = useCallback(
    (fields: Record<string, string>, message: string) => {
      setErrors(fields);
      setStatus({ kind: 'error', message });
      focusFirstError();
    },
    [focusFirstError],
  );

  /** Validates with the shared schema; on failure shows errors and returns null. */
  const check = useCallback(
    <S extends z.ZodType>(schema: S, payload: unknown): z.output<S> | null => {
      const result = schema.safeParse(payload);
      if (result.success) return result.data;
      fail(fieldErrors(result.error), CLIENT_VALIDATION_MESSAGE);
      return null;
    },
    [fail],
  );

  const failFromError = useCallback(
    (error: unknown) => {
      const fields = error instanceof ApiClientError ? error.fields : {};
      fail(fields, errorMessage(error));
    },
    [fail],
  );

  return {
    values,
    set,
    setValues,
    errors,
    setErrors,
    status,
    setStatus,
    formRef,
    check,
    fail,
    failFromError,
  };
}
