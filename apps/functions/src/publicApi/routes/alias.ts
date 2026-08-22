import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { AliasCollection } from '@okr/shared-models';
import type { AliasModel } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { buildAliasDocId, buildTargetUrl, getAliasUsability } from '@okr/system-alias-util';
import type { AliasUsability } from '@okr/system-alias-util';

import { appBaseUrl, spaceByName, tenantByHost } from '../../alias/tenant-domains';
import { recordUse } from '../../alias/tracking';
import { checkRateLimit, clientIp } from '../rateLimit';

/**
 * Der Alias ist im Pfad case-sensitiv unbekannt: die Document-ID wird über
 * `buildAliasDocId` normalisiert. Weil der Space erst NACH dem Read bekannt wäre, wird hier
 * case-insensitiv aufgelöst (der Default und die einzige Variante, die ein abgetippter oder
 * diktierter Code überlebt). Ein case-sensitiver `redirect`-Space wäre eine eigene Runde.
 */
const CASE_SENSITIVE = false;

const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/** Warum ein Alias nicht auflöst → welcher Status. 404 = nie existiert, 410 = existiert nicht mehr. */
const GONE_REASONS: ReadonlySet<AliasUsability> = new Set<AliasUsability>([
  'disabled', 'archived', 'notYetValid', 'expired', 'exhausted',
]);

function errorPage(res: Response, status: number, title: string, message: string): void {
  res.status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'private, no-store')
    .send(`<!doctype html><html lang="de"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<title>${title}</title><style>`
      + `body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;`
      + `min-height:100vh;display:flex;align-items:center;justify-content:center;`
      + `background:#f4f5f7;color:#23262d}`
      + `main{max-width:32rem;padding:2rem;text-align:center}`
      + `h1{font-size:1.5rem;margin:0 0 .75rem}p{margin:0;line-height:1.6;color:#5b6070}`
      + `@media(prefers-color-scheme:dark){body{background:#16181d;color:#e6e8ee}`
      + `p{color:#9aa0ae}}`
      + `</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`);
}

/**
 * `GET /s/:space/:code` — der öffentliche Resolver.
 *
 * Die einzige öffentliche Route AUSSERHALB von `/public/api/v1`: der Pfad ist Teil der
 * Kurz-URL und muss kurz bleiben. Sie antwortet mit HTML, nicht mit JSON — der Empfänger ist
 * ein Browser, der gerade einen QR-Code gescannt hat, kein API-Client.
 *
 * Auflösung ist ein einziges `getDoc` — kein Query, kein Index. Genau das macht einen Redirect
 * billig genug, um vor einem gedruckten Code zu stehen.
 */
export async function aliasRouter(req: Request, res: Response): Promise<void> {
  const space = String(req.params['space'] ?? '');
  const code = String(req.params['code'] ?? '');

  const limit = await checkRateLimit('alias', clientIp(req), RATE_LIMIT);
  if (!limit.allowed) {
    errorPage(res, 429, 'Zu viele Anfragen',
      'Bitte versuchen Sie es in einer Minute noch einmal.');
    return;
  }

  const host = String(req.headers['x-forwarded-host'] ?? req.headers['host'] ?? '');
  const tenantId = await tenantByHost(host);
  if (!tenantId) {
    logger.warn(`alias: unknown host '${host}'`);
    errorPage(res, 404, 'Link unbekannt', 'Dieser Kurzlink gehört zu keiner bekannten Adresse.');
    return;
  }

  const docId = buildAliasDocId(tenantId, space, code, CASE_SENSITIVE);
  const ref = getFirestore().collection(AliasCollection).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    errorPage(res, 404, 'Link unbekannt', 'Dieser Kurzlink existiert nicht.');
    return;
  }

  const alias = { okey: snap.id, ...snap.data() } as AliasModel;
  const usability = getAliasUsability(alias, getTodayStr(DateFormat.StoreDate));
  if (GONE_REASONS.has(usability)) {
    errorPage(res, 410, 'Link nicht mehr gültig',
      'Dieser Kurzlink wurde zurückgezogen oder ist abgelaufen.');
    return;
  }

  // targetType 'none' ist ein reiner Identifikator (Bootsmarke, Buchungsreferenz) und über
  // HTTP nicht auflösbar. Ein nicht kartiertes Modellziel liefert ebenfalls '' — siehe
  // ALIAS_TARGET_ROUTES; createAlias weist solche Ziele bereits beim Prägen ab, aber ein
  // Altbestand oder ein von Hand angelegter Alias kann sie tragen.
  const target = buildTargetUrl(alias, await appBaseUrl(tenantId));
  if (!target) {
    errorPage(res, 404, 'Kein Ziel hinterlegt', 'Dieser Code verweist auf keine Adresse.');
    return;
  }

  // Ohne no-store beantwortet der Browser den zweiten Scan aus dem Cache und der Zaehler
  // misst dauerhaft zu wenig.
  res.set('Cache-Control', 'private, no-store').redirect(302, target);

  // NACH der Antwort: ein Zaehlfehler ist billiger als ein haengender Scan vor einem Plakat.
  try {
    const space = await spaceByName(tenantId, alias.space);
    if (!space) {
      // Kein Space mehr (archiviert oder von Hand entfernt): der Redirect ist trotzdem
      // gelaufen, aber das effektive Tracking-Level ist nicht bestimmbar. Dann NUR der
      // Betriebszaehler — im Zweifel weniger aufzeichnen, nicht mehr.
      await ref.update({
        useCount: FieldValue.increment(1),
        lastUsedAt: getTodayStr(DateFormat.StoreDateTime),
      });
      return;
    }
    await recordUse(getFirestore(), docId, alias, space, {
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? ''),
      referrer: String(req.headers['referer'] ?? req.headers['referrer'] ?? ''),
      // Von der Google-Front-End gesetzt; fehlt lokal und im Emulator.
      country: String(req.headers['x-appengine-country'] ?? ''),
      uid: '',
      nowMs: Date.now(),
    }, ipHashSecret());
  } catch (err) {
    logger.error(`alias: counting ${docId} failed`, err);
  }
}

/**
 * Salt fuer den IP-Hash der `detailed`-Ereignisse.
 *
 * Aus der Umgebung, nicht hart im Code: ein im Repo stehendes Salt waere oeffentlich, und ein
 * oeffentlicher Hash ueber einen so kleinen Wertebereich wie eine IPv4-Adresse ist in Minuten
 * rueckrechenbar. Fehlt die Variable, faellt der Hash auf einen Instanz-Zufallswert zurueck —
 * dann ist die Verkettung sogar auf die Instanz begrenzt, was strenger ist, nicht laxer.
 */
let fallbackSecret = '';
function ipHashSecret(): string {
  const configured = process.env['ALIAS_IP_HASH_SECRET'];
  if (configured) return configured;
  fallbackSecret ||= randomBytes(32).toString('hex');
  return fallbackSecret;
}
