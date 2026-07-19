import { Injectable } from '@angular/core';

export type QuickEntryTrigger = 'person' | 'date' | 'location';

/** The 2-char (resp. 1-char) token that starts each quick-entry trigger. */
export const QuickEntryToken: Record<QuickEntryTrigger, '@' | '//' | '!!'> = {
  person: '@',
  date: '//',
  location: '!!'
};

/**
 * Resolves a quick-entry trigger to the text that replaces its token.
 * Returning null means "the user cancelled" - the token is then stripped.
 */
export type QuickEntryResolver = (trigger: QuickEntryTrigger) => Promise<string | null>;

@Injectable({ providedIn: 'root' })
export class QuickEntryService {

  public detectTrigger(text: string): QuickEntryTrigger | null {
    if (text.endsWith('!!')) return 'location';
    if (text.endsWith('@')) return 'person';
    if (text.endsWith('//')) return 'date';
    return null;
  }

  public replaceToken(text: string, trigger: '@' | '//' | '!!', replacement: string): string {
    const lastIndex = text.lastIndexOf(trigger);
    if (lastIndex === -1) return text;
    return text.substring(0, lastIndex) + replacement + text.substring(lastIndex + trigger.length);
  }
}
