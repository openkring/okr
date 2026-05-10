import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class QuickEntryService {

  public detectTrigger(text: string): 'person' | 'date' | null {
    if (text.endsWith('@')) return 'person';
    if (text.endsWith('//')) return 'date';
    return null;
  }

  public replaceToken(text: string, trigger: '@' | '//', replacement: string): string {
    const lastIndex = text.lastIndexOf(trigger);
    if (lastIndex === -1) return text;
    return text.substring(0, lastIndex) + replacement + text.substring(lastIndex + trigger.length);
  }
}
