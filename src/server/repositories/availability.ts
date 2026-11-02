import type { AvailabilityRule, Closure, WindowOverride } from '../../shared/availability';
import type { IsoDate } from '../../shared/dates';
import type {
  AvailabilityRuleInput,
  ClosureInput,
  WindowOverrideInput,
} from '../../shared/schemas';
import { orNull } from './sql';

interface RuleRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  capacity: number;
  active: number;
}

interface OverrideRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  note: string | null;
}

interface ClosureRow {
  date: string;
  reason: string | null;
}

const toRule = (r: RuleRow): AvailabilityRule => ({
  id: r.id,
  weekday: r.weekday,
  startTime: r.start_time,
  endTime: r.end_time,
  capacity: r.capacity,
  active: r.active === 1,
});

const toOverride = (r: OverrideRow): WindowOverride => ({
  id: r.id,
  date: r.date,
  startTime: r.start_time,
  endTime: r.end_time,
  capacity: r.capacity,
  note: r.note,
});

const toClosure = (r: ClosureRow): Closure => ({ date: r.date, reason: r.reason });

export async function listRules(db: D1Database): Promise<AvailabilityRule[]> {
  const { results } = await db
    .prepare(
      'SELECT id, weekday, start_time, end_time, capacity, active FROM availability_rules ORDER BY weekday, start_time',
    )
    .all<RuleRow>();
  return results.map(toRule);
}

export async function insertRule(
  db: D1Database,
  id: string,
  input: AvailabilityRuleInput,
  now: string,
): Promise<AvailabilityRule> {
  const row = await db
    .prepare(
      `INSERT INTO availability_rules (id, weekday, start_time, end_time, capacity, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       RETURNING id, weekday, start_time, end_time, capacity, active`,
    )
    .bind(
      id,
      input.weekday,
      input.startTime,
      input.endTime,
      input.capacity,
      input.active ? 1 : 0,
      now,
    )
    .first<RuleRow>();
  if (!row) throw new Error('Insert returned no row');
  return toRule(row);
}

export async function updateRule(
  db: D1Database,
  id: string,
  input: AvailabilityRuleInput,
  now: string,
): Promise<AvailabilityRule | null> {
  const row = await db
    .prepare(
      `UPDATE availability_rules
       SET weekday = ?2, start_time = ?3, end_time = ?4, capacity = ?5, active = ?6, updated_at = ?7
       WHERE id = ?1
       RETURNING id, weekday, start_time, end_time, capacity, active`,
    )
    .bind(
      id,
      input.weekday,
      input.startTime,
      input.endTime,
      input.capacity,
      input.active ? 1 : 0,
      now,
    )
    .first<RuleRow>();
  return row ? toRule(row) : null;
}

export async function deleteRule(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM availability_rules WHERE id = ?1').bind(id).run();
  return result.meta.changes > 0;
}

export async function listOverrides(
  db: D1Database,
  from: IsoDate,
  to: IsoDate,
): Promise<WindowOverride[]> {
  const { results } = await db
    .prepare(
      `SELECT id, date, start_time, end_time, capacity, note FROM window_overrides
       WHERE date BETWEEN ?1 AND ?2 ORDER BY date, start_time`,
    )
    .bind(from, to)
    .all<OverrideRow>();
  return results.map(toOverride);
}

export async function insertOverride(
  db: D1Database,
  id: string,
  input: WindowOverrideInput,
  now: string,
): Promise<WindowOverride> {
  const row = await db
    .prepare(
      `INSERT INTO window_overrides (id, date, start_time, end_time, capacity, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       RETURNING id, date, start_time, end_time, capacity, note`,
    )
    .bind(id, input.date, input.startTime, input.endTime, input.capacity, orNull(input.note), now)
    .first<OverrideRow>();
  if (!row) throw new Error('Insert returned no row');
  return toOverride(row);
}

export async function deleteOverride(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM window_overrides WHERE id = ?1').bind(id).run();
  return result.meta.changes > 0;
}

export async function listClosures(db: D1Database, from: IsoDate, to: IsoDate): Promise<Closure[]> {
  const { results } = await db
    .prepare('SELECT date, reason FROM closures WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(from, to)
    .all<ClosureRow>();
  return results.map(toClosure);
}

export async function upsertClosure(
  db: D1Database,
  input: ClosureInput,
  now: string,
): Promise<Closure> {
  const row = await db
    .prepare(
      `INSERT INTO closures (date, reason, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (date) DO UPDATE SET reason = excluded.reason
       RETURNING date, reason`,
    )
    .bind(input.date, orNull(input.reason), now)
    .first<ClosureRow>();
  if (!row) throw new Error('Upsert returned no row');
  return toClosure(row);
}

export async function deleteClosure(db: D1Database, date: IsoDate): Promise<boolean> {
  const result = await db.prepare('DELETE FROM closures WHERE date = ?1').bind(date).run();
  return result.meta.changes > 0;
}
