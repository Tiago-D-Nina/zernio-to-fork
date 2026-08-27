import { describe, expect, it } from 'vitest';

import {
  getActionPolicy,
  hasExplicitConfirmation,
  simulationResult,
  validateScheduleRequest,
} from '../../supabase/functions/_shared/action-policy';

const appointmentPolicy = {
  actionId: 'appointments',
  enabled: true,
  scheduling: {
    durationMinutes: 60,
    minimumNoticeHours: 2,
    maximumAdvanceDays: 30,
    timeZone: 'America/Sao_Paulo',
    allowedWeekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
  },
};

describe('action policy guards', () => {
  it('só habilita ações presentes na configuração publicada', () => {
    expect(getActionPolicy({ actions: [appointmentPolicy] }, 'appointments')).toBeTruthy();
    expect(getActionPolicy({ actions: [{ ...appointmentPolicy, enabled: false }] }, 'appointments')).toBeNull();
    expect(getActionPolicy({}, 'human_handoff')).toBeNull();
  });

  it('exige uma fala real do lead como confirmação', () => {
    const history = [{ role: 'user', content: 'Pode confirmar para terça às 10h, por favor.' }];
    expect(hasExplicitConfirmation(history, 'confirmar para terça às 10h')).toBe(true);
    expect(hasExplicitConfirmation(history, 'eu confirmo qualquer coisa')).toBe(false);
    expect(hasExplicitConfirmation(history, 'sim')).toBe(false);
  });

  it('rejeita passado, fim de semana e horário fora da política', () => {
    const now = new Date('2026-08-03T12:00:00Z'); // segunda, 09h em São Paulo
    expect(validateScheduleRequest({ date: '2026-08-03', time: '10:00' }, appointmentPolicy, now).code).toBe('minimum_notice');
    expect(validateScheduleRequest({ date: '2026-08-08', time: '10:00' }, appointmentPolicy, now).code).toBe('weekday_not_allowed');
    expect(validateScheduleRequest({ date: '2026-08-04', time: '18:00' }, appointmentPolicy, now).code).toBe('outside_business_hours');
    expect(validateScheduleRequest({ date: '2026-08-04', time: '10:00' }, appointmentPolicy, now)).toEqual({ ok: true });
  });

  it('marca inequivocamente resultados simulados', () => {
    expect(simulationResult('human_handoff', { reason: 'teste' })).toMatchObject({
      success: true,
      simulated: true,
      action: 'human_handoff',
    });
  });
});
