import { articleBlocksOf, withClassicFields, type MailBlock, type SectionModel } from '@okr/shared-models';

import { isObject, type Loose } from './article-block.util';
import { blocksInOrder, type NewId } from './article-editor.util';
import { copiedBlock, headerHtml, isPicture, mailCta, mailEventNumber, mailImage, mailImageStyle, objectOf, showsSomething, str, textBlock } from './mail-block-parts';

export { MAIL_EVENTS_MAX } from './mail-block-parts';

/**
 * The blocks of a Versand mail (spec 1.176): whether they say anything, and making them from a stored mail page. All functions are
 * pure, never mutate their input and never throw on malformed stored data.
 */

/**
 * Whether the mail has content (§8.1): a text or callout that shows something, a picture, a gallery or a button. Events, lines, spaces
 * and columns without content do not count. Something half entered counts: it is lost when a draft is discarded without a
 * question; whether it can be sent is decided by `mailBlocksValidations`.
 */
export function mailBlocksHaveContent(blocks: MailBlock[]): boolean {
  return Array.isArray(blocks) && blocksInOrder(blocks as Parameters<typeof blocksInOrder>[0]).some((block) => hasContent(block as unknown as Loose));
}

function hasContent(block: Loose): boolean {
  switch (block['type']) {
    case 'text': case 'callout': return showsSomething(block['html']);
    case 'image': return isPicture(block['image']);
    case 'gallery': return Array.isArray(block['images']) && block['images'].some(isPicture);
    case 'button': return hasCta(block['cta']);
    default: return false;
  }
}

function hasCta(value: unknown): boolean {
  const cta = objectOf(value);
  return str(cta['label']) !== '' || str(cta['url']) !== '';
}

/**
 * The blocks of a stored mail page, all with new ids (§8.5); `sections` in the order of the page. An article with blocks is copied as it
 * is. The sections of 1.172 become what their mail showed: an article its pictures, heading, text and button in this order, a button
 * section a centred button, events their block. What showed nothing and archived sections are left out. A section of a type
 * that no mail had becomes a block of that unknown type, which is an error to fix.
 */
export function mailBlocksFromSections(sections: SectionModel[], newId: NewId): MailBlock[] {
  const stored: unknown = sections;
  if (!Array.isArray(stored)) return [];
  return stored.filter(isObject).filter((section) => !section['isArchived'] && typeof section['type'] === 'string').flatMap((section) => {
    switch (section['type']) {
      case 'article': {
        const blocks = articleBlocksOf(section);
        return blocks ? blocks.map((block) => copiedBlock(block as unknown as Loose, newId)) : fromOldArticle(section, newId);
      }
      case 'button': return fromOldButton(section, newId);
      case 'events': return [fromOldEvents(section, newId)];
      default: return [{ id: newId(), type: section['type'] } as unknown as MailBlock];
    }
  });
}

/** The old mail drew the first picture only; the others come along, so that a continued draft loses none. */
function fromOldArticle(section: Loose, newId: NewId): MailBlock[] {
  const properties = objectOf(section['properties']);
  const style = properties['imageStyle'];
  const images = (Array.isArray(properties['images']) ? properties['images'] : []).filter(isPicture).map((image) => mailImage(image, style));
  const header = headerHtml(section);
  const html: unknown = objectOf(withClassicFields(section)['content'])['htmlContent'];
  const blocks: MailBlock[] = [];
  if (images.length === 1) blocks.push({ id: newId(), type: 'image', image: images[0], ...mailImageStyle(style) });
  if (images.length > 1) blocks.push({ id: newId(), type: 'gallery', images, ...mailImageStyle(style) });
  if (header) blocks.push(textBlock(newId(), header));
  if (showsSomething(html)) blocks.push(textBlock(newId(), html as string));
  if (hasCta(properties['cta'])) blocks.push({ id: newId(), type: 'button', cta: mailCta(properties['cta']) });
  return blocks;
}

function fromOldButton(section: Loose, newId: NewId): MailBlock[] {
  const properties = objectOf(section['properties']);
  const action = objectOf(properties['action']);
  const cta = mailCta({ label: str(objectOf(properties['style'])['label']) || str(action['altText']), url: action['url'] });
  return hasCta(cta) ? [{ id: newId(), type: 'button', cta, align: 'center' }] : [];
}

function fromOldEvents(section: Loose, newId: NewId): MailBlock {
  const title = str(section['title']);
  return { id: newId(), type: 'events', calendarKey: str(section['name']), ...(title ? { title } : {}), maxEvents: mailEventNumber(objectOf(section['properties'])['maxEvents']) };
}
