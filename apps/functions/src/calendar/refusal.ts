// apps/functions/src/calendar/refusal.ts
//
// Why an answer link is refused, and the text the answer page shows for it. A leaf module: the
// mail pages, the invitation endpoint and the Versand endpoint all need it, and none may import
// another's endpoint file for it.

import type { AnswerableEvent } from './invitation';

export type AnswerRefusal = 'invalid' | 'gone' | 'locked' | 'eventGone' | 'past' | 'cancelled';

export const REFUSAL_TEXT: Record<AnswerRefusal, { title: string; message: string }> = {
  invalid:   { title: 'Link ungültig', message: 'Dieser Link ist nicht gültig. Öffne die Einladung bitte in der App.' },
  gone:      { title: 'Einladung nicht mehr vorhanden', message: 'Diese Einladung gibt es nicht mehr.' },
  locked:    { title: 'Antworten geschlossen', message: 'Die Antworten zu diesem Anlass sind geschlossen. Wende dich bitte an die Organisation.' },
  eventGone: { title: 'Anlass nicht mehr vorhanden', message: 'Diesen Anlass gibt es nicht mehr.' },
  past:      { title: 'Anlass vorbei', message: 'Dieser Anlass hat bereits stattgefunden.' },
  cancelled: { title: 'Anlass abgesagt', message: 'Dieser Anlass wurde abgesagt.' },
};

/** The event half of every answer check (undefined = the event may still be answered). */
export function eventRefusalOf(event: AnswerableEvent | undefined, today: string): AnswerRefusal | undefined {
  if (!event || event.isArchived) return 'eventGone';
  if ((event.endDate || event.startDate || '') < today) return 'past';
  if (event.state === 'cancelled') return 'cancelled';
  if (event.isLocked) return 'locked';
  return undefined;
}
