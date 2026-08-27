export type GovernedActionId = 'appointments' | 'human_handoff';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    : '';
}

export function getActionPolicy(config: unknown, actionId: GovernedActionId): UnknownRecord | null {
  const actions = Array.isArray(record(config).actions) ? record(config).actions as unknown[] : [];
  const action = actions.map(record).find((candidate) => candidate.actionId === actionId);
  return action && action.enabled === true ? action : null;
}

/** A autorização precisa ser uma fala real do lead presente no histórico. Um
 * booleano gerado pelo modelo não é evidência suficiente. */
export function hasExplicitConfirmation(
  history: Array<{ role: string; content: string }>,
  evidence: unknown,
): boolean {
  const normalizedEvidence = normalize(evidence);
  if (normalizedEvidence.length < 4) return false;
  return history
    .filter((message) => message.role === 'user')
    .slice(-6)
    .some((message) => normalize(message.content).includes(normalizedEvidence));
}

export interface ScheduleValidationResult {
  ok: boolean;
  code?: 'invalid_date_time' | 'date_in_past' | 'minimum_notice' | 'maximum_advance' | 'weekday_not_allowed' | 'outside_business_hours' | 'invalid_duration';
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function timeToMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function localNowAsNominalUtc(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`);
}

export function validateScheduleRequest(
  input: { date?: unknown; time?: unknown; duration?: unknown },
  actionPolicy: unknown,
  now = new Date(),
): ScheduleValidationResult {
  const policy = record(record(actionPolicy).scheduling);
  const date = text(input.date, '');
  const time = text(input.time, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || timeToMinutes(time) === null) {
    return { ok: false, code: 'invalid_date_time' };
  }

  const requested = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(requested.getTime()) || requested.toISOString().slice(0, 10) !== date) {
    return { ok: false, code: 'invalid_date_time' };
  }

  const duration = numeric(input.duration, numeric(policy.durationMinutes, 60));
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
    return { ok: false, code: 'invalid_duration' };
  }

  const localNow = localNowAsNominalUtc(now, text(policy.timeZone, 'America/Sao_Paulo'));
  const differenceHours = (requested.getTime() - localNow.getTime()) / 3_600_000;
  if (differenceHours < 0) return { ok: false, code: 'date_in_past' };
  if (differenceHours < numeric(policy.minimumNoticeHours, 2)) return { ok: false, code: 'minimum_notice' };
  if (differenceHours > numeric(policy.maximumAdvanceDays, 60) * 24) return { ok: false, code: 'maximum_advance' };

  const allowedWeekdays = Array.isArray(policy.allowedWeekdays)
    ? policy.allowedWeekdays.filter((value): value is number => typeof value === 'number')
    : [1, 2, 3, 4, 5];
  if (!allowedWeekdays.includes(requested.getUTCDay())) return { ok: false, code: 'weekday_not_allowed' };

  const requestedStart = timeToMinutes(time)!;
  const allowedStart = timeToMinutes(text(policy.startTime, '09:00'))!;
  const allowedEnd = timeToMinutes(text(policy.endTime, '18:00'))!;
  if (requestedStart < allowedStart || requestedStart + duration > allowedEnd) {
    return { ok: false, code: 'outside_business_hours' };
  }

  return { ok: true };
}

export function simulationResult(action: string, input: UnknownRecord) {
  return {
    success: true,
    simulated: true,
    action,
    input,
    message: 'SIMULAÇÃO: nenhuma alteração real foi executada.',
  };
}
