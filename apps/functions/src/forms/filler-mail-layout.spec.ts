import { describe, expect, it } from 'vitest';

import { EmailTemplateError, type RenderEmailRequest } from '../email/render-email';
import { FILLER_MAIL_LAYOUTS, wrapFillerMail } from './filler-mail-layout';

const BODY = '<h2>Anmeldung</h2>\n<p>Hallo Anna</p>';

/** A renderer that knows only the given layouts and records every attempt. */
function renderer(known: string[]) {
  const tried: string[] = [];
  const render = async (req: RenderEmailRequest) => {
    tried.push(String(req.layout));
    if (!known.includes(String(req.layout))) throw new EmailTemplateError('not usable', 'no-layout');
    return { subject: '', html: `<frame ${req.layout}>${req.body}</frame>`, text: `${req.layout}: text` };
  };
  return { render, tried };
}

describe('wrapFillerMail', () => {
  it('tries the logo-only layout first, then the standard one (which itself falls back to plain)', () => {
    expect(FILLER_MAIL_LAYOUTS).toEqual(['email-layout-logo', 'standard']);
  });

  it('puts the mail into the tenant\'s logo-only layout', async () => {
    const { render, tried } = renderer(['email-layout-logo', 'standard']);
    const mail = await wrapFillerMail('scs', BODY, render);
    expect(tried).toEqual(['email-layout-logo']);
    expect(mail).toEqual({ html: `<frame email-layout-logo>${BODY}</frame>`, text: 'email-layout-logo: text', layout: 'email-layout-logo' });
  });

  it('takes the standard layout for a tenant without a logo-only one', async () => {
    const { render, tried } = renderer(['standard']);
    const mail = await wrapFillerMail('p13', BODY, render);
    expect(tried).toEqual(['email-layout-logo', 'standard']);
    expect(mail.layout).toBe('standard');
  });

  it('sends the bare mail when no layout renders (a broken template never stops the thank-you mail)', async () => {
    const { render } = renderer([]);
    expect(await wrapFillerMail('okr', BODY, render)).toEqual({ html: BODY, text: undefined, layout: 'none' });
  });

  it('treats any render error like a missing layout', async () => {
    const mail = await wrapFillerMail('scs', BODY, async () => { throw new Error('handlebars exploded'); });
    expect(mail.layout).toBe('none');
  });

  it('asks for the tenant\'s own layout with the mail as body', async () => {
    const seen: RenderEmailRequest[] = [];
    await wrapFillerMail('scs', BODY, async (req) => { seen.push(req); return { subject: '', html: 'x', text: 'y' }; });
    expect(seen[0]).toMatchObject({ tenantId: 'scs', layout: 'email-layout-logo', body: BODY });
  });
});
