import { useState } from 'preact/hooks';
import type {
  AdminAvailability,
  AdminScheduleWindow,
  ListResponse,
} from '../../../shared/api-types';
import type { AvailabilityRule } from '../../../shared/availability';
import { formatDateShort, formatWindow } from '../../../shared/dates';
import { sendJson } from '../lib/api';
import { LoadState, useAction, useResource } from './shared';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SchedulePanel({ today }: { today: string }) {
  const availability = useResource<AdminAvailability>('/api/admin/availability');
  const schedule = useResource<ListResponse<AdminScheduleWindow>>(
    `/api/admin/schedule?from=${today}&days=14`,
  );
  const reloadAll = () => {
    availability.reload();
    schedule.reload();
  };

  return (
    <section aria-labelledby="schedule-heading" class="admin-stack">
      <h2 id="schedule-heading">Schedule &amp; availability</h2>

      <div class="card">
        <h3>Next 14 days</h3>
        <LoadState resource={schedule} empty={(schedule.data?.items.length ?? 0) === 0}>
          <div class="table-scroll" role="region" aria-label="Next 14 days" tabIndex={0}>
            <table class="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Window</th>
                  <th scope="col">Booked</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {schedule.data?.items.map((w) => (
                  <tr
                    key={`${w.date}-${w.startTime}`}
                    class={w.booked > w.capacity ? 'is-over' : w.capacity === 0 ? 'is-closed' : ''}
                  >
                    <td>{formatDateShort(w.date)}</td>
                    <td>{formatWindow(w.startTime, w.endTime)}</td>
                    <td>
                      {w.capacity === 0 ? 'Closed' : `${w.booked} / ${w.capacity}`}
                      {w.booked > w.capacity && <strong> (over capacity)</strong>}
                    </td>
                    <td>{w.source === 'override' ? 'Override' : 'Weekly'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LoadState>
      </div>

      <div class="card">
        <h3>Weekly schedule</h3>
        <p class="small muted">
          Recurring windows. Capacity is how many jobs can run at once (usually the number of
          cleaners).
        </p>
        <LoadState resource={availability}>
          <ul class="admin-list" role="list">
            {availability.data?.rules.map((rule) => (
              <RuleRow
                key={`${rule.id}-${rule.capacity}-${String(rule.active)}`}
                rule={rule}
                onChanged={reloadAll}
              />
            ))}
          </ul>
        </LoadState>
        <AddRuleForm onChanged={reloadAll} />
      </div>

      <div class="grid grid--2">
        <div class="card">
          <h3>Date overrides</h3>
          <p class="small muted">
            Change capacity for one date, add an extra window, or set capacity to 0 to close a
            window.
          </p>
          <LoadState resource={availability}>
            <ul class="admin-list" role="list">
              {availability.data?.overrides.map((o) => (
                <DeletableRow
                  key={o.id}
                  label={`${formatDateShort(o.date)} · ${formatWindow(o.startTime, o.endTime)} · ${o.capacity === 0 ? 'closed' : `capacity ${o.capacity}`}${o.note ? ` · ${o.note}` : ''}`}
                  path={`/api/admin/availability/overrides/${o.id}`}
                  onChanged={reloadAll}
                />
              ))}
            </ul>
          </LoadState>
          <AddOverrideForm today={today} onChanged={reloadAll} />
        </div>
        <div class="card">
          <h3>Closed days</h3>
          <p class="small muted">No bookings on these dates (breaks, holidays, exams).</p>
          <LoadState resource={availability}>
            <ul class="admin-list" role="list">
              {availability.data?.closures.map((c) => (
                <DeletableRow
                  key={c.date}
                  label={`${formatDateShort(c.date)}${c.reason ? ` · ${c.reason}` : ''}`}
                  path={`/api/admin/availability/closures/${c.date}`}
                  onChanged={reloadAll}
                />
              ))}
            </ul>
          </LoadState>
          <AddClosureForm today={today} onChanged={reloadAll} />
        </div>
      </div>
    </section>
  );
}

function RuleRow({ rule, onChanged }: { rule: AvailabilityRule; onChanged: () => void }) {
  const { busy, run } = useAction();
  const [capacity, setCapacity] = useState(String(rule.capacity));
  const [active, setActive] = useState(rule.active);
  const dirty = capacity !== String(rule.capacity) || active !== rule.active;
  const label = `${WEEKDAYS[rule.weekday] ?? ''} ${formatWindow(rule.startTime, rule.endTime)}`;
  return (
    <li class="admin-row">
      <span class="admin-row__label">{label}</span>
      <label class="admin-inline">
        Capacity
        <input
          class="input input--tiny"
          type="number"
          min={0}
          max={50}
          value={capacity}
          onInput={(e) => {
            setCapacity(e.currentTarget.value);
          }}
        />
      </label>
      <label class="admin-inline">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.currentTarget.checked);
          }}
        />{' '}
        Active
      </label>
      <button
        type="button"
        class="btn btn--small"
        disabled={busy || !dirty}
        onClick={() =>
          void run(
            () =>
              sendJson(
                `/api/admin/availability/rules/${rule.id}`,
                {
                  weekday: rule.weekday,
                  startTime: rule.startTime,
                  endTime: rule.endTime,
                  capacity: Number(capacity),
                  active,
                },
                'PUT',
              ),
            `${label} updated`,
            onChanged,
          )
        }
      >
        Save<span class="visually-hidden"> {label}</span>
      </button>
      <button
        type="button"
        class="btn btn--small btn--secondary"
        disabled={busy}
        onClick={() => {
          if (!window.confirm(`Delete the weekly window ${label}? Existing bookings are kept.`))
            return;
          void run(
            () => sendJson(`/api/admin/availability/rules/${rule.id}`, undefined, 'DELETE'),
            `${label} deleted`,
            onChanged,
          );
        }}
      >
        Delete<span class="visually-hidden"> {label}</span>
      </button>
    </li>
  );
}

function DeletableRow({
  label,
  path,
  onChanged,
}: {
  label: string;
  path: string;
  onChanged: () => void;
}) {
  const { busy, run } = useAction();
  return (
    <li class="admin-row">
      <span class="admin-row__label">{label}</span>
      <button
        type="button"
        class="btn btn--small btn--secondary"
        disabled={busy}
        onClick={() => void run(() => sendJson(path, undefined, 'DELETE'), 'Removed', onChanged)}
      >
        Remove<span class="visually-hidden"> {label}</span>
      </button>
    </li>
  );
}

function AddRuleForm({ onChanged }: { onChanged: () => void }) {
  const { busy, run } = useAction();
  const [form, setForm] = useState({
    weekday: '1',
    startTime: '16:00',
    endTime: '18:00',
    capacity: '2',
  });
  return (
    <form
      class="admin-add"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            sendJson('/api/admin/availability/rules', {
              ...form,
              weekday: Number(form.weekday),
              capacity: Number(form.capacity),
            }),
          'Weekly window added',
          onChanged,
        );
      }}
    >
      <h4>Add a weekly window</h4>
      <div class="admin-add__fields">
        <label class="field">
          <span class="field__label">Day</span>
          <select
            class="select"
            value={form.weekday}
            onChange={(e) => {
              setForm({ ...form, weekday: e.currentTarget.value });
            }}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={String(i)}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <TimeInputs
          form={form}
          setForm={(next) => {
            setForm({ ...form, ...next });
          }}
        />
        <label class="field">
          <span class="field__label">Capacity</span>
          <input
            class="input"
            type="number"
            min={0}
            max={50}
            required
            value={form.capacity}
            onInput={(e) => {
              setForm({ ...form, capacity: e.currentTarget.value });
            }}
          />
        </label>
      </div>
      <button class="btn btn--small" type="submit" disabled={busy}>
        Add window
      </button>
    </form>
  );
}

function TimeInputs({
  form,
  setForm,
}: {
  form: { startTime: string; endTime: string };
  setForm: (next: { startTime?: string; endTime?: string }) => void;
}) {
  return (
    <>
      <label class="field">
        <span class="field__label">Start</span>
        <input
          class="input"
          type="time"
          step={900}
          required
          value={form.startTime}
          onInput={(e) => {
            setForm({ startTime: e.currentTarget.value });
          }}
        />
      </label>
      <label class="field">
        <span class="field__label">End</span>
        <input
          class="input"
          type="time"
          step={900}
          required
          value={form.endTime}
          onInput={(e) => {
            setForm({ endTime: e.currentTarget.value });
          }}
        />
      </label>
    </>
  );
}

function AddOverrideForm({ today, onChanged }: { today: string; onChanged: () => void }) {
  const { busy, run } = useAction();
  const [form, setForm] = useState({
    date: today,
    startTime: '16:00',
    endTime: '18:00',
    capacity: '0',
    note: '',
  });
  return (
    <form
      class="admin-add"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            sendJson('/api/admin/availability/overrides', {
              ...form,
              capacity: Number(form.capacity),
            }),
          'Override saved',
          onChanged,
        );
      }}
    >
      <h4>Add an override</h4>
      <div class="admin-add__fields">
        <label class="field">
          <span class="field__label">Date</span>
          <input
            class="input"
            type="date"
            min={today}
            required
            value={form.date}
            onInput={(e) => {
              setForm({ ...form, date: e.currentTarget.value });
            }}
          />
        </label>
        <TimeInputs
          form={form}
          setForm={(next) => {
            setForm({ ...form, ...next });
          }}
        />
        <label class="field">
          <span class="field__label">Capacity (0 closes)</span>
          <input
            class="input"
            type="number"
            min={0}
            max={50}
            required
            value={form.capacity}
            onInput={(e) => {
              setForm({ ...form, capacity: e.currentTarget.value });
            }}
          />
        </label>
        <label class="field">
          <span class="field__label">Note</span>
          <input
            class="input"
            type="text"
            maxLength={200}
            value={form.note}
            onInput={(e) => {
              setForm({ ...form, note: e.currentTarget.value });
            }}
          />
        </label>
      </div>
      <button class="btn btn--small" type="submit" disabled={busy}>
        Save override
      </button>
    </form>
  );
}

function AddClosureForm({ today, onChanged }: { today: string; onChanged: () => void }) {
  const { busy, run } = useAction();
  const [form, setForm] = useState({ date: today, reason: '' });
  return (
    <form
      class="admin-add"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => sendJson('/api/admin/availability/closures', form), 'Day closed', onChanged);
      }}
    >
      <h4>Close a day</h4>
      <div class="admin-add__fields">
        <label class="field">
          <span class="field__label">Date</span>
          <input
            class="input"
            type="date"
            min={today}
            required
            value={form.date}
            onInput={(e) => {
              setForm({ ...form, date: e.currentTarget.value });
            }}
          />
        </label>
        <label class="field">
          <span class="field__label">Reason</span>
          <input
            class="input"
            type="text"
            maxLength={200}
            value={form.reason}
            onInput={(e) => {
              setForm({ ...form, reason: e.currentTarget.value });
            }}
          />
        </label>
      </div>
      <button class="btn btn--small" type="submit" disabled={busy}>
        Close day
      </button>
    </form>
  );
}
