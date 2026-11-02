import { weekdays, type ApplicationStatus, type WeekdayKey } from '../../config/site';
import type { AdminApplication } from '../../shared/api-types';
import type { ApplicationRequest } from '../../shared/schemas';
import { orNull } from './sql';

interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  name: string;
  email: string;
  phone: string;
  class_year: AdminApplication['classYear'];
  availability: string;
  hours_per_week: number;
  experience: string | null;
  motivation: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

function parseAvailability(json: string): WeekdayKey[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? weekdays.filter((d) => value.includes(d)) : [];
  } catch {
    return [];
  }
}

function toAdminApplication(row: ApplicationRow): AdminApplication {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    email: row.email,
    phone: row.phone,
    classYear: row.class_year,
    availability: parseAvailability(row.availability),
    hoursPerWeek: row.hours_per_week,
    experience: row.experience,
    motivation: row.motivation,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertApplication(
  db: D1Database,
  app: { id: string; createdAt: string } & Omit<
    ApplicationRequest,
    'turnstileToken' | 'company' | 'agreeTerms'
  >,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO applications (id, status, name, email, phone, class_year, availability,
         hours_per_week, experience, motivation, created_at, updated_at)
       VALUES (?1, 'new', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
    )
    .bind(
      app.id,
      app.name,
      app.email,
      app.phone,
      app.classYear,
      JSON.stringify(app.availability),
      app.hoursPerWeek,
      orNull(app.experience),
      app.motivation,
      app.createdAt,
    )
    .run();
}

export async function listApplications(
  db: D1Database,
  filter: { status?: ApplicationStatus | undefined; limit: number; offset: number },
): Promise<AdminApplication[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM applications WHERE (?1 IS NULL OR status = ?1)
       ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`,
    )
    .bind(orNull(filter.status), filter.limit, filter.offset)
    .all<ApplicationRow>();
  return results.map(toAdminApplication);
}

export async function updateApplication(
  db: D1Database,
  id: string,
  patch: { status?: ApplicationStatus | undefined; adminNotes?: string | null | undefined },
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE applications
       SET status = COALESCE(?2, status),
           admin_notes = CASE WHEN ?3 = 1 THEN ?4 ELSE admin_notes END,
           updated_at = ?5
       WHERE id = ?1`,
    )
    .bind(
      id,
      orNull(patch.status),
      patch.adminNotes === undefined ? 0 : 1,
      orNull(patch.adminNotes),
      now,
    )
    .run();
  return result.meta.changes > 0;
}
