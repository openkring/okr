import { logger } from 'firebase-functions/v2';

import type { EmailLayoutChoice } from '@okr/shared-models';

import { renderEmail, type RenderEmailRequest, type RenderedEmail } from '../email/render-email';

/**
 * The layouts a form's thank-you mail tries, in order: the tenant's «Logo-only» layout
 * (`email-layout-logo_<tenantId>`, a small logo, no colour band), else its standard layout, which
 * itself falls back to the plain one. Chosen for every form alike; there is no per-form setting.
 */
export const FILLER_MAIL_LAYOUTS: readonly EmailLayoutChoice[] = ['email-layout-logo', 'standard'];

export interface WrappedFillerMail {
  html: string;
  /** the plain-text half of the layout; undefined for the bare mail */
  text: string | undefined;
  /** which layout was used, for the log; 'none' = the bare mail */
  layout: EmailLayoutChoice | 'none';
}

/**
 * Puts the thank-you mail (`buildFillerConfirmationHtml`, already escaped) into the first layout that
 * renders. A missing or broken template never stops the mail: it then goes out bare, as before.
 */
export async function wrapFillerMail(
  tenantId: string,
  body: string,
  render: (req: RenderEmailRequest) => Promise<RenderedEmail> = renderEmail,
): Promise<WrappedFillerMail> {
  for (const layout of FILLER_MAIL_LAYOUTS) {
    try {
      const { html, text } = await render({ tenantId, layout, body });
      return { html, text, layout };
    } catch (e) {
      logger.info(`wrapFillerMail: layout ${layout} not used for tenant ${tenantId} (${e instanceof Error ? e.name : 'error'})`);
    }
  }
  return { html: body, text: undefined, layout: 'none' };
}
