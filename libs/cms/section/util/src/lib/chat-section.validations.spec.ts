import { describe, expect, it } from 'vitest';
import { CHAT_SECTION_SHAPE, ChatSection } from '@bk2/shared-models';

import { chatSectionValidations } from './chat-section.validations';

describe('chatSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(chatSectionValidations({ ...CHAT_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...CHAT_SECTION_SHAPE, title: 123 } as unknown as ChatSection;
    expect(chatSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags a non-string chat url', () => {
    const model = { ...CHAT_SECTION_SHAPE, properties: { ...CHAT_SECTION_SHAPE.properties, url: 123 } } as unknown as ChatSection;
    expect(chatSectionValidations(model).hasErrors('url')).toBe(true);
  });
});
