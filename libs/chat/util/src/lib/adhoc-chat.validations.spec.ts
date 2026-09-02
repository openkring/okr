import { describe, expect, it } from 'vitest';

import { AvatarInfo } from '@okr/shared-models';

import { ADHOC_CHAT_MAX_MEMBERS, AdhocChatFormModel, newAdhocChatForm } from './adhoc-chat.model';
import { adhocChatValidations } from './adhoc-chat.validations';

function member(key: string): AvatarInfo {
  return { key, name1: 'Anna', name2: 'Roth', modelType: 'person', type: '', subType: '', label: '' };
}

function model(overrides: Partial<AdhocChatFormModel> = {}): AdhocChatFormModel {
  return { ...newAdhocChatForm(), ...overrides };
}

describe('adhocChatValidations', () => {
  it('accepts one other person without a name — that becomes a direct message', () => {
    const result = adhocChatValidations(model({ members: [member('anna')] }));
    expect(result.isValid()).toBe(true);
  });

  it('ignores a name on the direct-message path rather than rejecting it', () => {
    const result = adhocChatValidations(model({ name: 'Kormoran Samstag', members: [member('anna')] }));
    expect(result.isValid()).toBe(true);
  });

  it('requires a name from two other people on — an ad-hoc chat is named, not derived', () => {
    const result = adhocChatValidations(model({ members: [member('anna'), member('beat')] }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('name')).toContain('nameRequired');
  });

  it('rejects a whitespace-only name for an ad-hoc chat', () => {
    const result = adhocChatValidations(model({ name: '   ', members: [member('anna'), member('beat')] }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('name')).toContain('nameRequired');
  });

  it('accepts a named ad-hoc chat', () => {
    const result = adhocChatValidations(model({ name: 'Kormoran Samstag', members: [member('anna'), member('beat')] }));
    expect(result.isValid()).toBe(true);
  });

  it('fails without a single other person — there is nobody to chat with', () => {
    const result = adhocChatValidations(model());
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('members')).toContain('membersRequired');
  });

  it('fails beyond the member ceiling (the creator counts too)', () => {
    const members = Array.from({ length: ADHOC_CHAT_MAX_MEMBERS }, (_, i) => member(`p${i}`));
    const result = adhocChatValidations(model({ name: 'Grosse Runde', members }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('members')).toContain('membersMax');
  });

  it('accepts exactly the ceiling', () => {
    const members = Array.from({ length: ADHOC_CHAT_MAX_MEMBERS - 1 }, (_, i) => member(`p${i}`));
    const result = adhocChatValidations(model({ name: 'Grosse Runde', members }));
    expect(result.isValid()).toBe(true);
  });
});
