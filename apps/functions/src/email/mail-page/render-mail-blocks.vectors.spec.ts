import { describe, expect, it } from 'vitest';

// the one table of mails that the app's spec (cms-section-util mail-blocks.vectors.spec.ts) checks, too; test data, no lib export
// eslint-disable-next-line @nx/enforce-module-boundaries -- a shared test table, not an import of the lib
import { MAIL_BLOCK_VECTORS, VECTOR_CALENDAR } from '../../../../../libs/shared/util-core/src/testing/mail-block-vectors';
import { sanitizeEmailBody } from '../../pdf/sanitize';
import { renderMailBlocks, type MailBlockContext, type MailTarget } from './render-mail-blocks.logic';
import { MailPageError } from './render-mail-page.logic';

async function contextOf(target: MailTarget): Promise<MailBlockContext> {
  const { default: hb } = await import('handlebars');
  const events = { [VECTOR_CALENDAR]: [{ date: '04.12.2026', time: '19:00', title: 'Höck', place: 'Clubhaus' }] };
  return { hb, sanitize: sanitizeEmailBody, events, appOrigin: 'https://app.example.ch', color: '#014da2', target };
}

/** What the server makes of the blocks: its refusal, or whether the mail shows something. */
async function outcome(blocks: unknown, target: MailTarget): Promise<{ refused: string } | { hasContent: boolean }> {
  try {
    return { hasContent: (await renderMailBlocks(blocks, await contextOf(target))).hasContent };
  } catch (e) {
    if (e instanceof MailPageError) return { refused: e.code };
    throw e;
  }
}

describe('the mail block vectors (spec 1.176: what the app accepts, the server renders)', () => {
  const accepted = MAIL_BLOCK_VECTORS.filter((vector) => vector.valid);

  it('holds vectors of both kinds', () => {
    expect(accepted.length).toBeGreaterThan(20);
    expect(MAIL_BLOCK_VECTORS.length - accepted.length).toBeGreaterThan(20);
  });

  it.each(accepted.flatMap((vector) => (['mail', 'print'] as const).map((target) => [vector.name, target, vector] as const)))(
    '%s (%s): rendered, with content exactly when the app counts it',
    async (_name, target, vector) => {
      expect(await outcome(vector.blocks, target)).toEqual({ hasContent: vector.hasContent });
    },
  );
});
