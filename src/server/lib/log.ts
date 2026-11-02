/**
 * Structured JSON logging. NEVER pass PII (names, emails, phones, rooms, free text) as fields:
 * log ids, references, codes and counts only (AGENTS.md → Privacy).
 */
type LogValue = string | number | boolean | null | undefined;

export function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, LogValue> = {},
): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
