// apps/functions/src/email/compose-sample.ts
//
// What a reader of a Versand will see, for the preview and the test mail (spec 1.176 §8.4): the content with the parts a
// send adds around it, in the same order and through the same `composeBody`. Their links are inactive samples.
import type { EmailLayoutChoice } from '@okr/shared-models';

import { WEB_LINK_LABEL, withWebLink } from './mail-page/web-version.logic';
import { ANSWER_LINK_LABEL, answerBlockHtml, type AnswerEventLine, UNSUBSCRIBE_LINK_LABEL, unsubscribeBlockHtml } from './personal-mail.logic';
import { composeBody, firestoreTemplateReader, type RenderedEmail, type TemplateReader } from './render-email';

/** Where the sample links lead: nowhere, so a test mail can never answer or unsubscribe for somebody. */
const SAMPLE_URL = '#';

export async function composeSample(
  tenantId: string,
  args: { content: string; layout: EmailLayoutChoice; attachmentName?: string; answerEvents: AnswerEventLine[]; newsletter: boolean; webLink: boolean },
  read: TemplateReader = firestoreTemplateReader,
): Promise<RenderedEmail> {
  const body = (args.webLink ? withWebLink(args.content, SAMPLE_URL, WEB_LINK_LABEL) : args.content)
    + (args.answerEvents.length > 0 ? answerBlockHtml(SAMPLE_URL, args.answerEvents) : '')
    + (args.newsletter ? unsubscribeBlockHtml(SAMPLE_URL) : '');
  const rendered = await composeBody(tenantId, { body, layout: args.layout, attachmentName: args.attachmentName }, read);
  // the text half names a link's address in brackets; a sample has none to show. Found by label and `(#)`, since the text has
  // no links any more: an author's own link with one of these labels and the address # would lose its brackets too
  const text = [WEB_LINK_LABEL, ANSWER_LINK_LABEL, UNSUBSCRIBE_LINK_LABEL]
    .reduce((out, label) => out.split(`${label} (${SAMPLE_URL})`).join(label), rendered.text);
  return { ...rendered, text };
}
