/** Email delivery behind an interface (ADR 0007). */
import type { Bindings } from '../env';
import { headerSafe } from '../lib/html';
import { log } from '../lib/log';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | undefined;
}

export interface Mailer {
  readonly kind: 'console' | 'resend';
  send(message: MailMessage): Promise<void>;
}

/** Sends nothing: logs a redacted line instead. Used when email isn't configured (blocker B6). */
export class ConsoleMailer implements Mailer {
  readonly kind = 'console';

  send(message: MailMessage): Promise<void> {
    log('info', 'email.not_sent', {
      reason: 'mailer_not_configured',
      toDomain: message.to.split('@')[1] ?? 'unknown',
      subject: headerSafe(message.subject),
    });
    return Promise.resolve();
  }
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export class ResendMailer implements Mailer {
  readonly kind = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: headerSafe(message.subject),
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Resend responded with HTTP ${response.status}`);
    }
  }
}

export function mailerFromEnv(env: Bindings): Mailer {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  return apiKey && from ? new ResendMailer(apiKey, from) : new ConsoleMailer();
}
