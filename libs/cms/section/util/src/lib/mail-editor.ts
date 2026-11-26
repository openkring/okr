import type { Signal } from '@angular/core';
import { staticSuite } from 'vest';

import type { ArticleSection, MailBlock, WebsiteModel } from '@okr/shared-models';
import type { MailEventLine } from '@okr/shared-util-core';

import { blocksInOrder, createBlock, type NewId } from './article-editor.util';
import type { EditorHistory, EditorState } from './article-editor-history.util';
import { mailBlocksValidations } from './mail-blocks.validations';
import { blockIdsWithErrors, type SectionErrors } from './section-errors';
import { showsSomething, textBlock } from './mail-block-parts';

/**
 * The editor of a Versand mail in the composer (spec 1.176 §8.1, §10). The composer (`pdf-template-ui`) and the host of the editor
 * (`cms-article-feature`) do not know each other: these types are what passes between them.
 */

/** What the host may read about the tenant; every function reads once and keeps its answer. Opened by `bulk-email.ts`. */
export interface MailEditorContext {
  /** The calendars an events block can list, by name. */
  calendars(): Promise<{ key: string; name: string }[]>;
  /** The upcoming events of a calendar as a mail lists them, at most MAX_MAIL_EVENTS; [] when none or unreadable. */
  eventLines(calendarKey: string): Promise<MailEventLine[]>;
  /** The articles the sender may insert («Artikel einfügen»), newest first. */
  articles(): Promise<ArticleSection[]>;
  /** The tenant's website, for the page of a teaser; undefined when it has none. */
  site(): Promise<WebsiteModel | undefined>;
}

/** The draft as the host sees it: the history of the mail's article, which outlives the host, and the errors of its blocks. */
export interface MailEditorDraft {
  /** The draft page the history belongs to: a host made for one page drops what ends late for another (an upload after «Zurücksetzen»). */
  readonly pageKey: Signal<string>;
  readonly history: Signal<EditorHistory<EditorState>>;
  /** Refuses changes of the blocks while true (a send runs); the editor is then not to be used. */
  readonly readOnly: Signal<boolean>;
  setHistory(history: EditorHistory<EditorState>): void;
  readonly errors: Signal<SectionErrors>;
}

const mailBlocksSuite = staticSuite((blocks: MailBlock[]) => mailBlocksValidations(blocks));

/** One run of the mail's rules: the errors by field (`blocks.<id>.<field>`), whether it may be sent, and how many blocks have errors. */
export function checkMailBlocks(blocks: MailBlock[]): { errors: SectionErrors; valid: boolean; errorCount: number } {
  const result = mailBlocksSuite(blocks);
  const errors = result.getErrors();
  return { errors, valid: result.isValid(), errorCount: blockIdsWithErrors(errors, Array.isArray(blocks) ? blocks : []).length };
}

/**
 * The blocks of a new mail (§8.1): one text, with the html of a prefilled caller when it shows something. What a reader never sees and
 * that could run (comments, `<style>`, `<script>`) is removed; the rest is parsed by the text editor when it is opened, as any stored text.
 */
export function mailBlocksFromBody(html: string | undefined, newId: NewId): MailBlock[] {
  if (!showsSomething(html)) return [createBlock('text', newId)];
  const clean = (html as string).replace(/<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>/gi, '');
  return [textBlock(newId(), clean)];
}

/** The first text of the mail, in reading order (also in a column); undefined without one. Where the cursor goes from the subject. */
export function firstTextId(blocks: MailBlock[]): string | undefined {
  return Array.isArray(blocks) ? blocksInOrder(blocks).find((block) => block?.type === 'text')?.id : undefined;
}
