import { createHash } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { AliasEventCollection, AliasStatsCollection } from '@okr/shared-models';
import type { AliasModel, AliasSpaceModel } from '@okr/shared-models';
import { getEffectiveTracking } from '@okr/system-alias-util';

/** Was der Resolver über einen einzelnen Aufruf weiss. */
export interface UseContext {
  readonly ip: string;
  readonly userAgent: string;
  readonly referrer: string;
  readonly country: string;
  readonly uid: string;
  /** Millisekunden — hereingereicht, damit Tests nicht an der Systemuhr hängen. */
  readonly nowMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Der Referrer wird auf den HOST reduziert.
 *
 * Eine volle Referrer-URL kann selbst Personendaten tragen (Suchbegriffe, Token im Query-Teil).
 * Für die Frage „woher kamen die Klicks" reicht der Host, und mehr zu speichern wäre
 * Vorratsdatenhaltung ohne Zweck.
 */
export function referrerHost(referrer: string): string {
  if (!referrer) return 'direct';
  try {
    return new URL(referrer).host || 'direct';
  } catch {
    return 'unknown';
  }
}

/** Grobe Geräteklasse. Absichtlich zwei Werte — ein feineres Raster wäre ein Fingerabdruck. */
export function deviceClass(userAgent: string): 'mobile' | 'desktop' {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ? 'mobile' : 'desktop';
}

/** yyyy-MM-dd in UTC — der Kalendertag des Aggregats. */
export function statsDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * SHA-256 über IP + TAGESROTIERENDEM Salt.
 *
 * Die Rotation ist der Punkt: ohne sie liesse sich derselbe Hash über Monate hinweg
 * wiedererkennen und damit ein Bewegungsprofil bilden. Mit ihr ist die Verkettung auf einen
 * Kalendertag begrenzt. Es bleibt trotzdem ein Pseudonym, keine Anonymisierung — deshalb ist
 * `aliasEvents` privileged-read, in der Subject-Data-Map erfasst und ohne Aufbewahrungsfrist
 * nicht konfigurierbar.
 */
export function hashIp(ip: string, nowMs: number, secret: string): string {
  if (!ip) return '';
  return createHash('sha256').update(`${statsDate(nowMs)}|${secret}|${ip}`).digest('hex').slice(0, 32);
}

/** StoreDateTime (yyyyMMddHHmmss) aus Millisekunden — UTC, wie der Rest der Resolver-Seite. */
function storeDateTime(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Einen Aufruf verbuchen — der ganze Tracking-Pfad des Resolvers.
 *
 * Drei Stufen, gestaffelt nach dem effektiven Level:
 * - **immer** (auch bei `off`): `useCount`/`lastUsedAt` auf dem Alias. Das ist keine Statistik,
 *   sondern Betrieb — `maxUses` wird daraus geprüft, und ohne den Zähler wäre ein Einmal-Link
 *   nicht durchsetzbar.
 * - **`counter` und `detailed`**: das Tagesaggregat.
 * - **nur `detailed`**: eine Zeile pro Klick mit gehashter IP und uid.
 *
 * `retentionDays: 0` heisst „nie ablaufen" und lässt `expiresAt` weg — für das Aggregat
 * zulässig, für ein Event nicht: dort erzwingt die Vest-Suite bereits beim Konfigurieren eine
 * Frist, und diese Funktion schreibt zur Sicherheit kein Event ohne `expiresAt`.
 */
export async function recordUse(
  db: Firestore,
  aliasKey: string,
  alias: AliasModel,
  space: AliasSpaceModel,
  ctx: UseContext,
  ipSecret: string,
): Promise<void> {
  const { level, retentionDays } = getEffectiveTracking(alias, space);

  await db.collection('aliases').doc(aliasKey).update({
    useCount: FieldValue.increment(1),
    lastUsedAt: storeDateTime(ctx.nowMs),
  });

  if (level === 'off') return;

  await writeDailyAggregate(db, aliasKey, alias, ctx, retentionDays);
  if (level === 'detailed') {
    await writeEvent(db, aliasKey, alias, ctx, retentionDays, ipSecret);
  }
}

async function writeDailyAggregate(
  db: Firestore,
  aliasKey: string,
  alias: AliasModel,
  ctx: UseContext,
  retentionDays: number,
): Promise<void> {
  const date = statsDate(ctx.nowMs);
  // VERSCHACHTELTE Maps, keine gepunkteten Schluessel: `set()` behandelt einen Punkt im
  // Schluessel als LITERALEN Feldnamen (nur `update()` liest ihn als Pfad). Ein
  // `'byReferrer.google.com'` haette also ein Feld dieses Namens auf oberster Ebene angelegt
  // statt den Eintrag in der Map hochzuzaehlen. merge:true fuehrt verschachtelte Maps
  // zusammen, und increment wirkt darin korrekt.
  const doc: Record<string, unknown> = {
    tenants: alias.tenants,
    isArchived: false,
    aliasKey,
    space: alias.space,
    date,
    count: FieldValue.increment(1),
    byReferrer: { [sanitizeKey(referrerHost(ctx.referrer))]: FieldValue.increment(1) },
    byDevice: { [deviceClass(ctx.userAgent)]: FieldValue.increment(1) },
    byCountry: { [sanitizeKey(ctx.country || 'unknown')]: FieldValue.increment(1) },
  };
  if (retentionDays > 0) {
    doc['expiresAt'] = Timestamp.fromMillis(ctx.nowMs + retentionDays * DAY_MS);
  }
  // set(merge) + increment: kein vorheriger Read, und zwei gleichzeitige Klicks addieren sich
  // korrekt statt einander zu überschreiben.
  await db.collection(AliasStatsCollection).doc(`${aliasKey}__${date}`).set(doc, { merge: true });
}

async function writeEvent(
  db: Firestore,
  aliasKey: string,
  alias: AliasModel,
  ctx: UseContext,
  retentionDays: number,
  ipSecret: string,
): Promise<void> {
  // Ohne Frist kein Event. `detailed` ohne retentionDays ist über das Formular nicht
  // konfigurierbar; ein von Hand gesetzter Space soll hier trotzdem keinen unbefristeten
  // PII-Bestand erzeugen können.
  if (retentionDays <= 0) return;

  await db.collection(AliasEventCollection).add({
    tenants: alias.tenants,
    isArchived: false,
    aliasKey,
    space: alias.space,
    at: storeDateTime(ctx.nowMs),
    referrer: referrerHost(ctx.referrer),
    userAgent: ctx.userAgent.slice(0, 200),
    ipHash: hashIp(ctx.ip, ctx.nowMs, ipSecret),
    uid: ctx.uid,
    expiresAt: Timestamp.fromMillis(ctx.nowMs + retentionDays * DAY_MS),
  });
}

/** Firestore-Map-Schlüssel dürfen keinen Punkt enthalten — er trennt sonst den Feldpfad. */
export function sanitizeKey(value: string): string {
  return value.replace(/[.$[\]#/]/g, '_').slice(0, 60) || 'unknown';
}
