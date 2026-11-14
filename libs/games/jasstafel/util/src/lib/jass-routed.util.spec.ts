import { describe, expect, it } from 'vitest';
import { jassParticipant, jassRouted } from './jass-routed.util';

describe('jassRouted', () => {
  it('shows the button with a consent for jasstafel', () =>
    expect(jassRouted({ diaryConsents: [{ tenantId: 'bka', uid: 'u', sources: ['jasstafel'] }] }, undefined)).toBe(true));
  it('shows it in a diary app pulling from itself', () =>
    expect(jassRouted({}, { tenantId: 'bka', sources: ['jasstafel'] })).toBe(true));
  it('ignores an old target', () =>
    expect(jassRouted({ diaryTargets: [{ tenantId: 'bka', sources: ['jasstafel'], from: '', to: '' }] } as never, undefined)).toBe(false));
  it('hides it for another source', () =>
    expect(jassRouted({ diaryConsents: [{ tenantId: 'bka', uid: 'u', sources: ['taskDone'] }] }, { tenantId: 'bka', sources: ['taskDone'] })).toBe(false));
  it('hides it for a legacy user', () => expect(jassRouted(undefined, undefined)).toBe(false));
});

describe('jassParticipant', () => {
  const game = { players: [{ avatar: { key: 'p1' } }, { avatar: { key: '' } }, { avatar: { key: 'p3' } }] };
  it('accepts a player', () => expect(jassParticipant(game, 'p3')).toBe(true));
  it('refuses a scorekeeper who did not play', () => expect(jassParticipant(game, 'p9')).toBe(false));
  it('never matches a typed guest', () => expect(jassParticipant(game, '')).toBe(false));
  it('refuses without a person', () => expect(jassParticipant(game, undefined)).toBe(false));
  it('refuses without a game', () => expect(jassParticipant(null, 'p1')).toBe(false));
});
