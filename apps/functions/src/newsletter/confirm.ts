// apps/functions/src/newsletter/confirm.ts
//
// The link of the double-opt-in mail (spec 1.169 §5.3): `?s=<signupKey>&h=<signature>`. Unlike the
// unsubscribe link, confirming on GET is safe for link prefetch: a mail scanner only confirms an address
// whose owner received the mail at it, which is the very proof the double opt-in asks for. The sign-up doc
// is claimed inside subscribePerson's transaction, which serialises a double click.

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { invitationLinkSecret } from '../calendar/answer-link';
import { brandOf, NO_TENANT_LINKS, tenantLinks } from '../calendar/deliver';
import { answerResultPage, Brand } from '../calendar/mail';
import { ANSWER_PAGE_CSP } from '../email/mailing-answer.logic';
import { pageFrame } from '../email/mailing-answer';
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import { verifyNewsletterConfirm } from './newsletter-link';
import { checkNewsletterGroup } from './signup';
import { subscribePerson } from './subscriber';
import { confirmOutcome } from './confirm.logic';
import { NewsletterSignupCollection, NewsletterSignupDoc } from './types';

const CF_NAME = 'newsletterConfirm';
const TITLE = 'Newsletter';

function param(req: { query: Record<string, unknown> }, name: string): string {
  const value = req.query[name];
  return typeof value === 'string' ? value : '';
}

export const newsletterConfirm = onRequest(
  { region: 'europe-west6', secrets: [invitationLinkSecret], cors: false, maxInstances: 10 },
  async (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', ANSWER_PAGE_CSP);
    if (req.method !== 'GET' && req.method !== 'POST') { res.set('Allow', 'GET, POST'); res.status(405).send(''); return; }

    let brand: Brand = { appName: '' };
    try {
      const signupKey = param(req, 's');
      const sig = param(req, 'h');
      const secret = invitationLinkSecret.value();
      const show = (message: string, status = 200): void => {
        res.status(status).send(answerResultPage({ ...brand, title: TITLE, message }));
      };
      const INVALID = 'Dieser Link ist ungültig.';
      // Fail closed: without a secret no signature can be trusted — no reads, no writes.
      if (secret === '' || signupKey === '') { show(INVALID, 403); return; }

      const db = getFirestore();
      const ref = db.collection(NewsletterSignupCollection).doc(signupKey);
      const snap = await ref.get();
      const signup = snap.exists ? (snap.data() as NewsletterSignupDoc) : undefined;
      const tenantId = signup?.tenants?.[0] ?? '';
      const links = tenantId ? await tenantLinks(tenantId) : NO_TENANT_LINKS;
      brand = { ...brandOf(links), ...(tenantId ? { frame: await pageFrame(tenantId) } : {}) };

      const sigOk = verifyNewsletterConfirm(signupKey, sig, secret);
      const group = signup && sigOk ? await checkNewsletterGroup(db, tenantId, signup.groupKey) : { ok: false as const };
      const now = new Date();
      const outcome = confirmOutcome(signup, sigOk, group.ok, now);

      if (outcome === 'invalid' || !signup || !group.ok) { show(INVALID, 403); return; }
      if (outcome === 'expired') { show('Dieser Bestätigungslink ist abgelaufen. Melde dich bitte noch einmal an.'); return; }
      const thanks = `Danke, du erhältst jetzt den Newsletter ${group.name}.`;
      if (outcome === 'alreadyConfirmed') { show(thanks); return; }

      // subscribePerson sets the sign-up to 'confirmed' in its own transaction (claimRef). Every result
      // shows the thank-you page; a shared email or possible duplicates become a task for the member admins.
      const result = await subscribePerson(db, {
        tenantId, groupKey: signup.groupKey, groupName: group.name,
        firstName: signup.firstName, lastName: signup.lastName, email: signup.email, city: signup.city,
        source: 'form', formKey: signup.formKey,
        confirmedAt: toStoreDateTime(now), dateOfEntry: toStoreDate(now), claimRef: ref,
      });
      logger.info(`${CF_NAME}: confirmed one sign-up (tenant ${tenantId}, ${result.outcome})`);
      show(thanks);
    } catch (err) {
      // Never log the key, signature, name or address — only that it failed.
      logger.error(`${CF_NAME}: failed`, err);
      if (res.headersSent) return;
      res.status(500).send(answerResultPage({ ...brand, title: 'Das hat nicht geklappt', message: 'Versuch es bitte nochmals.' }));
    }
  },
);
