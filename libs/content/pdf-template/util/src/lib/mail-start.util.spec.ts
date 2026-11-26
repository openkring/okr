import { describe, expect, it } from 'vitest';

import type { MailPageModel } from '@okr/shared-models';

import type { MailingView } from './mailing.util';
import {
  choicesWithoutSubject, composerCloseDecision, draftCandidates, earlierMails, filterStartChoices, pageTime, START_DRAFTS_MAX,
  START_EARLIER_MAX, startChoices, startStepWanted, storedTime, type StartPage,
} from './mail-start.util';

const page = (okey: string, fields: Partial<MailPageModel> = {}): MailPageModel =>
  ({ okey, tenants: ['scs'], senderUid: 'u1', createdAt: '2026-11-01T10:00:00.000Z', sections: [], ...fields }) as MailPageModel;
const entry = (p: MailPageModel, hasContent?: boolean, firstWords?: string): StartPage => ({ page: p, hasContent, firstWords });
const mailing = (okey: string, fields: Partial<MailingView> = {}): MailingView => ({ okey, tenants: ['scs'], createdAt: '20261110120000', ...fields });

describe('storedTime / pageTime', () => {
  it('reads ISO and StoreDateTime, 0 for anything else', () => {
    expect(storedTime('2026-11-01T10:00:00.000Z')).toBe(Date.parse('2026-11-01T10:00:00.000Z'));
    expect(storedTime('20261110120000')).toBe(new Date(2026, 10, 10, 12, 0, 0).getTime());
    for (const value of ['', undefined, 'gestern']) expect(storedTime(value as string)).toBe(0);
  });

  it('takes changedAt, else createdAt', () => {
    expect(pageTime({ createdAt: '2026-11-01T10:00:00.000Z', changedAt: '2026-11-05T10:00:00.000Z' })).toBe(Date.parse('2026-11-05T10:00:00.000Z'));
    expect(pageTime({ createdAt: '2026-11-01T10:00:00.000Z' })).toBe(Date.parse('2026-11-01T10:00:00.000Z'));
  });
});

describe('draftCandidates', () => {
  it('only unsent pages of the tenant, not the new draft of the composer, newest first, at most 20', () => {
    const pages = [
      page('old'), page('new', { changedAt: '2026-11-20T10:00:00.000Z' }), page('sent', { mailingKey: 'm1' }),
      page('other', { tenants: ['p13'] }), page('mine-now', { changedAt: '2026-11-26T10:00:00.000Z' }),
    ];
    expect(draftCandidates(pages, 'scs', 'mine-now').map((p) => p.okey)).toEqual(['new', 'old']);
    const many = Array.from({ length: 30 }, (_, i) => page(`p${i}`, { changedAt: new Date(Date.UTC(2026, 10, 1, i)).toISOString() }));
    const picked = draftCandidates(many, 'scs');
    expect(picked).toHaveLength(START_DRAFTS_MAX);
    expect(picked[0].okey).toBe('p29');
  });
});

describe('startChoices', () => {
  it('offers drafts with content only; another tenant’s and sent pages are no drafts', () => {
    const { drafts } = startChoices([
      entry(page('full', { subject: ' Einladung ' }), true, 'Liebe Mitglieder'),
      entry(page('empty'), false),
      entry(page('unread')),
      entry(page('foreign', { tenants: ['p13'] }), true),
      entry(page('sent', { mailingKey: 'm1' }), true),
    ], [], false, 'scs');
    expect(drafts).toEqual([{ kind: 'draft', pageKey: 'full', subject: 'Einladung', firstWords: 'Liebe Mitglieder', time: Date.parse('2026-11-01T10:00:00.000Z') }]);
  });

  it('lists drafts newest first, by changedAt else createdAt', () => {
    const { drafts } = startChoices([
      entry(page('a', { createdAt: '2026-11-03T10:00:00.000Z' }), true),
      entry(page('b', { createdAt: '2026-11-01T10:00:00.000Z', changedAt: '2026-11-04T10:00:00.000Z' }), true),
      entry(page('c', { createdAt: '2026-11-02T10:00:00.000Z' }), true),
    ], [], false, 'scs');
    expect(drafts.map((d) => d.pageKey)).toEqual(['b', 'a', 'c']);
  });

  it('a sent page without subject shows its date and first words', () => {
    const { earlier } = startChoices([entry(page('s', { mailingKey: 'm1', changedAt: '2026-11-08T10:00:00.000Z' }), true, 'Am Samstag rudern wir')], [], false, 'scs');
    expect(earlier).toEqual([{ kind: 'copy', pageKey: 's', subject: '', firstWords: 'Am Samstag rudern wir', time: Date.parse('2026-11-08T10:00:00.000Z') }]);
  });

  it('no choice at all when there is nothing to choose', () => {
    expect(startChoices([entry(page('empty'), false)], [mailing('m1')], true, 'scs')).toEqual({ drafts: [], earlier: [] });
    expect(startChoices(undefined as unknown as StartPage[], undefined as unknown as MailingView[], true, 'scs')).toEqual({ drafts: [], earlier: [] });
  });
});

describe('earlierMails', () => {
  it('member admins get the mailings with a page, once each, with the mailing subject when the page has none', () => {
    const earlier = earlierMails([entry(page('p1', { mailingKey: 'm1' }), true, 'erste Worte')], [
      mailing('m1', { pageKey: 'p1', subject: 'Generalversammlung', createdAt: '20261110120000' }),
      mailing('m0', { subject: 'vor 1.172', createdAt: '20261111120000' }),
      mailing('m2', { pageKey: 'p2', subject: 'Regatta', createdAt: '20261112120000' }),
      mailing('m3', { pageKey: 'p2', subject: 'Regatta', createdAt: '20261101120000' }),
      mailing('m4', { pageKey: 'p4', tenants: ['p13'] }),
      mailing('m5', { pageKey: 'a/b' }),
    ], true, 'scs');
    expect(earlier.map((c) => [c.pageKey, c.subject, c.firstWords])).toEqual([['p2', 'Regatta', ''], ['p1', 'Generalversammlung', 'erste Worte']]);
    expect(earlier[0].time).toBe(storedTime('20261112120000'));
  });

  it('the own sent pages come along, once; a group admin sees only them', () => {
    const pages = [entry(page('own', { mailingKey: 'm9', subject: 'Eigenes' })), entry(page('draft'), true), entry(page('p1', { mailingKey: 'm1' }))];
    const mailings = [mailing('m1', { pageKey: 'p1', subject: 'Von allen' }), mailing('m2', { pageKey: 'p2', subject: 'Fremd' })];
    expect(earlierMails(pages, mailings, true, 'scs').map((c) => c.pageKey).sort()).toEqual(['own', 'p1', 'p2']);
    expect(earlierMails(pages, mailings, false, 'scs').map((c) => c.pageKey).sort()).toEqual(['own', 'p1']);
  });

  it('shows at most 50', () => {
    const mailings = Array.from({ length: 60 }, (_, i) => mailing(`m${i}`, { pageKey: `p${i}`, createdAt: `202611${String(i % 28 + 1).padStart(2, '0')}120000` }));
    expect(earlierMails([], mailings, true, 'scs')).toHaveLength(START_EARLIER_MAX);
  });
});

describe('choicesWithoutSubject / filterStartChoices', () => {
  const choices = [
    { kind: 'copy' as const, pageKey: 'a', subject: 'Einladung Generalversammlung', firstWords: '', time: 3 },
    { kind: 'copy' as const, pageKey: 'b', subject: '', firstWords: 'Am Samstag rudern wir', time: 2 },
    { kind: 'copy' as const, pageKey: 'c', subject: '', firstWords: '', time: 1 },
  ];

  it('names the pages whose first words are still needed', () => {
    expect(choicesWithoutSubject(choices)).toEqual(['c']);
  });

  it('filters by every word in subject and first words, ignoring case and accents', () => {
    expect(filterStartChoices(choices, '').map((c) => c.pageKey)).toEqual(['a', 'b', 'c']);
    expect(filterStartChoices(choices, 'general EINLAD').map((c) => c.pageKey)).toEqual(['a']);
    expect(filterStartChoices(choices, 'sämstag').map((c) => c.pageKey)).toEqual(['b']);
    expect(filterStartChoices(choices, 'regatta')).toEqual([]);
  });
});

describe('startStepWanted', () => {
  const base = { isVersand: true, bodyDefault: '', subjectDefault: '', storagePath: '', filename: '' };
  it('only for a Versand that opens empty', () => {
    expect(startStepWanted(base)).toBe(true);
    expect(startStepWanted({ ...base, isVersand: false })).toBe(false);
    expect(startStepWanted({ ...base, bodyDefault: '<p>Hallo</p>' })).toBe(false);
    expect(startStepWanted({ ...base, subjectDefault: 'Protokoll' })).toBe(false);
    expect(startStepWanted({ ...base, storagePath: 'tenant/scs/doc.pdf', filename: 'doc.pdf' })).toBe(false);
  });
});

describe('composerCloseDecision', () => {
  const base = { isVersand: true, sent: false, busy: false, hasContent: true };
  it('asks with content, waits while sending, else lets it close', () => {
    expect(composerCloseDecision(base)).toBe('ask');
    expect(composerCloseDecision({ ...base, hasContent: false })).toBe('allow');
    expect(composerCloseDecision({ ...base, busy: true })).toBe('wait');
    expect(composerCloseDecision({ ...base, busy: true, hasContent: false })).toBe('wait');
    expect(composerCloseDecision({ ...base, sent: true, busy: true })).toBe('allow');
    expect(composerCloseDecision({ ...base, isVersand: false })).toBe('allow');
  });
});
