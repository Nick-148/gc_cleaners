import type { MessageStatus } from '../../config/site';
import type { AdminMessage } from '../../shared/api-types';
import type { ContactRequest } from '../../shared/schemas';
import { orNull } from './sql';

interface MessageRow {
  id: string;
  status: MessageStatus;
  name: string;
  email: string;
  phone: string | null;
  topic: AdminMessage['topic'];
  booking_reference: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

const toAdminMessage = (row: MessageRow): AdminMessage => ({
  id: row.id,
  status: row.status,
  name: row.name,
  email: row.email,
  phone: row.phone,
  topic: row.topic,
  bookingReference: row.booking_reference,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function insertMessage(
  db: D1Database,
  message: { id: string; createdAt: string } & Omit<ContactRequest, 'turnstileToken' | 'company'>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages (id, status, name, email, phone, topic, booking_reference, body,
         created_at, updated_at)
       VALUES (?1, 'new', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
    )
    .bind(
      message.id,
      message.name,
      message.email,
      orNull(message.phone),
      message.topic,
      orNull(message.bookingReference),
      message.message,
      message.createdAt,
    )
    .run();
}

export async function listMessages(
  db: D1Database,
  filter: { status?: MessageStatus | undefined; limit: number; offset: number },
): Promise<AdminMessage[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM messages WHERE (?1 IS NULL OR status = ?1)
       ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`,
    )
    .bind(orNull(filter.status), filter.limit, filter.offset)
    .all<MessageRow>();
  return results.map(toAdminMessage);
}

export async function updateMessageStatus(
  db: D1Database,
  id: string,
  status: MessageStatus,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE messages SET status = ?2, updated_at = ?3 WHERE id = ?1')
    .bind(id, status, now)
    .run();
  return result.meta.changes > 0;
}
