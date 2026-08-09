import { TicketModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import {
  acceptSubmission, classifyTicket, isChargeable, isSlaBreached, isVersionSupported,
  causeMix, getTicketIndex, isTicket, netResolutionDays, rejectSubmission, resumeFromPartner,
  setSeverity, slaDeadlines, validateSubmission, waitOnPartner, workDaysBetween,
} from './ticket.util';

/** A complete §3 submission. Mondays used throughout so working-day maths is easy to read. */
function submission(overrides: Partial<TicketModel> = {}): TicketModel {
  return {
    ...new TicketModel('kring'),
    name: 'Mitgliederliste lädt nicht',
    partnerKey: 'p1',
    appVersion: '7.11.0',
    firebaseProjectId: 'partner-prod',
    affectedTenantId: 'verein-x',
    sentryEventUrl: 'https://sentry.io/e/1',
    reproSteps: 'Liste öffnen',
    platform: 'Chrome 140 / macOS',
    ...overrides,
  };
}

describe('supported version window (§3)', () => {
  it('accepts the current and the previous minor', () => {
    expect(isVersionSupported('7.11.0', '7.11.0')).toBe(true);
    expect(isVersionSupported('7.10.4', '7.11.0')).toBe(true);
  });

  it('rejects anything older, and anything newer than we ship', () => {
    expect(isVersionSupported('7.9.9', '7.11.0')).toBe(false);
    expect(isVersionSupported('6.20.0', '7.11.0')).toBe(false);
    expect(isVersionSupported('7.12.0', '7.11.0')).toBe(false);
  });

  it('rejects an unreadable version rather than waving it through', () => {
    expect(isVersionSupported('', '7.11.0')).toBe(false);
    expect(isVersionSupported('latest', '7.11.0')).toBe(false);
  });

  it('accepts the previous major across a x.0 bump', () => {
    expect(isVersionSupported('7.11.0', '8.0.0')).toBe(true);
    expect(isVersionSupported('6.11.0', '8.0.0')).toBe(false);
  });
});

describe('validateSubmission (§3)', () => {
  it('accepts a complete, in-window submission', () => {
    expect(validateSubmission(submission(), '7.11.0')).toEqual({ ok: true, missing: [] });
  });

  it('names every missing required field instead of failing on the first', () => {
    const v = validateSubmission(submission({ reproSteps: '', platform: '  ' }), '7.11.0');
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['reproSteps', 'platform']);
  });

  it('rejects an out-of-window version even when the form is complete', () => {
    const v = validateSubmission(submission({ appVersion: '5.0.0' }), '7.11.0');
    expect(v.ok).toBe(false);
    expect(v.rejectedReason).toContain('5.0.0');
  });

  it('treats a missing submission as incomplete, not as an exception', () => {
    expect(validateSubmission(undefined, '7.11.0').missing).toHaveLength(6);
  });
});

describe('acceptSubmission (§6.1)', () => {
  it('redacts the free text before it is ever stored', () => {
    const t = acceptSubmission(submission({ description: 'Mail an hans@example.ch, IBAN CH9300762011623852957' }), '20260810');
    expect(t.description).toBe('Mail an [EMAIL], IBAN [IBAN]');
  });

  it('drops attachments unless the partner confirmed the redaction', () => {
    expect(acceptSubmission(submission({ attachmentPaths: ['a.png'] }), '20260810').attachmentPaths).toEqual([]);
    const confirmed = acceptSubmission(submission({ attachmentPaths: ['a.png'], redactionConfirmed: true }), '20260810');
    expect(confirmed.attachmentPaths).toEqual(['a.png']);
  });

  it('starts both SLA legs from the submission date', () => {
    const t = acceptSubmission(submission(), '20260810'); // Monday
    expect(t.workaroundDueAt).toBe('20260812');
    expect(t.fixDueAt).toBe('20260813');
  });

  it('skips the weekend when the clock starts on a Thursday', () => {
    expect(slaDeadlines('20260813')).toEqual({ workaroundDueAt: '20260817', fixDueAt: '20260818' });
  });
});

describe('classification (§4)', () => {
  it('bills everything that is not a product defect', () => {
    expect(isChargeable('defect')).toBe(false);
    expect(isChargeable('unclassified')).toBe(false);
    expect(isChargeable('misconfiguration')).toBe(true);
    expect(isChargeable('how-to')).toBe(true);
  });

  it('refuses to classify without a reason and an author', () => {
    expect(classifyTicket(submission(), 'defect', '', 'bruno')).toBeUndefined();
    expect(classifyTicket(submission(), 'defect', 'reproduced', ' ')).toBeUndefined();
  });

  it('records who classified it, when and why — and allows a revision', () => {
    const first = classifyTicket(submission(), 'how-to', 'documented in §4', 'bruno', '20260810');
    expect(first).toMatchObject({ classification: 'how-to', classifiedBy: 'bruno', classifiedAt: '20260810' });
    const revised = classifyTicket(first as TicketModel, 'defect', 'reproduced on 7.11', 'bruno', '20260812');
    expect(revised).toMatchObject({ classification: 'defect', classificationReason: 'reproduced on 7.11' });
  });
});

describe('waiting on partner (§5)', () => {
  it('banks the waiting interval and excludes it from resolution time', () => {
    const t = acceptSubmission(submission(), '20260810');       // Mon
    const parked = waitOnPartner({ ...t, status: 'accepted' }, '20260811');
    const resumed = resumeFromPartner(parked, '20260813');       // 2 working days later
    expect(resumed.waitingDays).toBe(2);
    expect(resumed.waitingSince).toBe('');
    expect(netResolutionDays({ ...resumed, fixedAt: '20260814' }, 'fixedAt')).toBe(2);
  });

  it('accumulates across several round trips', () => {
    const once = resumeFromPartner(waitOnPartner(submission({ status: 'accepted' }), '20260810'), '20260811');
    const twice = resumeFromPartner(waitOnPartner(once, '20260812'), '20260814');
    expect(twice.waitingDays).toBe(3);
  });

  it('is a no-op when the ticket was never parked', () => {
    const t = submission({ status: 'accepted' });
    expect(resumeFromPartner(t, '20260812')).toBe(t);
  });

  it('reports no resolution time before the milestone is reached', () => {
    expect(netResolutionDays(acceptSubmission(submission(), '20260810'), 'fixedAt')).toBeUndefined();
  });
});

describe('SLA breach (§4)', () => {
  const base = acceptSubmission(submission(), '20260810'); // workaround due 20260812, fix due 20260813

  it('is false while inside the window', () => {
    expect(isSlaBreached(base, 'workaround', '20260812')).toBe(false);
  });

  it('is true once the due date has passed with nothing delivered', () => {
    expect(isSlaBreached(base, 'workaround', '20260813')).toBe(true);
  });

  it('judges each leg on its own delivery', () => {
    const t = { ...base, workaroundAt: '20260811' };
    expect(isSlaBreached(t, 'workaround', '20260820')).toBe(false);
    expect(isSlaBreached(t, 'fix', '20260820')).toBe(true);
  });

  it('gives back the days the partner kept us waiting', () => {
    expect(isSlaBreached({ ...base, waitingDays: 3 }, 'workaround', '20260813')).toBe(false);
  });
});

describe('workDaysBetween', () => {
  it('counts working days only, and never goes negative', () => {
    expect(workDaysBetween('20260810', '20260817')).toBe(5); // Mon → Mon
    expect(workDaysBetween('20260817', '20260810')).toBe(0);
    expect(workDaysBetween('', '20260810')).toBe(0);
  });
});

describe('rejectSubmission', () => {
  it('keeps the refused submission with its reason so §5 can count them', () => {
    const t = rejectSubmission(submission(), 'version 5.0.0 out of window', '20260810');
    expect(t).toMatchObject({ status: 'rejected', closedAt: '20260810' });
    expect(t.rejectedReason).toContain('5.0.0');
  });
});

describe('setSeverity', () => {
  const accepted = acceptSubmission(submission(), '20260810');

  it('drops the released-fix deadline when the tenant can still work — §8', () => {
    const t = setSeverity(accepted, 'non-blocking');
    expect(t.fixDueAt).toBe('');
    // the workaround leg is owed either way, so it must survive the downgrade untouched
    expect(t.workaroundDueAt).toBe(accepted.workaroundDueAt);
    expect(isSlaBreached(t, 'fix', '20260901')).toBe(false);
  });

  it('recomputes an upgrade from the submission date, not from the triage date', () => {
    const t = setSeverity(setSeverity(accepted, 'non-blocking'), 'blocking');
    expect(t.fixDueAt).toBe(accepted.fixDueAt);
  });

  it('promises nothing for a ticket that never started the clock', () => {
    expect(setSeverity(submission(), 'blocking').fixDueAt).toBe('');
  });
});

describe('getTicketIndex', () => {
  it('indexes what the queue is searched by', () => {
    const index = getTicketIndex(submission());
    expect(index).toContain('Mitgliederliste');
    expect(index).toContain('verein-x');
    expect(index).toContain('7.11.0');
  });

  it('never indexes the two contaminated-by-default fields (§6.1)', () => {
    const index = getTicketIndex(submission({
      description: 'Kontakt hans.muster@example.ch',
      sentryEventJson: '{"user":"hans"}',
    }));
    expect(index).not.toContain('example.ch');
    expect(index).not.toContain('hans');
  });
});

describe('isTicket', () => {
  it('rejects what is not a ticket', () => {
    expect(isTicket(submission(), 'kring')).toBe(true);
    expect(isTicket(undefined, 'kring')).toBe(false);
    expect(isTicket('ticket', 'kring')).toBe(false);
  });
});

describe('causeMix', () => {
  it('counts a rejected submission apart from every cause — §5', () => {
    const mix = causeMix([
      submission({ classification: 'defect' }),
      submission({ classification: 'how-to' }),
      // classified BEFORE being refused: it must still not count as a cause
      submission({ classification: 'defect', status: 'rejected' }),
      submission(),
    ]);
    expect(mix).toEqual({ unclassified: 1, defect: 1, misconfiguration: 0, 'how-to': 1, rejected: 1 });
  });
});
