import { staticSuite } from 'vest';
import { describe, expect, it } from 'vitest';

import type { MailBlock } from '@okr/shared-models';

// the one table of mails that the server's spec (apps/functions render-mail-blocks.vectors.spec.ts) renders, too; test data, no lib export
// eslint-disable-next-line @nx/enforce-module-boundaries -- a shared test table, not an import of the lib
import { MAIL_BLOCK_VECTORS } from '../../../../../shared/util-core/src/testing/mail-block-vectors';
import { mailBlocksHaveContent } from './mail-blocks.util';
import { mailBlocksValidations } from './mail-blocks.validations';

const suite = staticSuite((blocks: unknown) => mailBlocksValidations(blocks as MailBlock[]));

describe('the mail block vectors (spec 1.176: what the app accepts, the server renders)', () => {
  it.each(MAIL_BLOCK_VECTORS.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const result = suite(vector.blocks);
    expect({ valid: result.isValid(), errors: result.getErrors() }).toEqual(expect.objectContaining({ valid: vector.valid }));
    expect(mailBlocksHaveContent(vector.blocks as MailBlock[])).toBe(vector.hasContent);
  });
});
