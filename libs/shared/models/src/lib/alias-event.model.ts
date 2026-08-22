import type { Timestamp } from 'firebase/firestore';

import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/**
 * Eine Zeile pro Klick — nur bei `trackingLevel: 'detailed'`.
 *
 * **Das hier sind Personendaten.** `ipHash` und `uid` beziehen sich auf eine bestimmte Person,
 * auch wenn die IP gehasht ist: ein Hash ohne Salt-Rotation ist ein Pseudonym, kein
 * Anonymisierungsverfahren. Deshalb
 *
 * - ist die Collection privileged-read (`firestore.rules`),
 * - hat sie eine Zeile in `subject-data-map.ts` (Datenauskunft und Löschung erreichen sie),
 * - und `detailed` ist ohne `retentionDays > 0` gar nicht konfigurierbar (Vest-Suite).
 *
 * Wer nur wissen will, ob ein Plakat wirkt, nimmt `counter` und legt damit gar keinen
 * PII-Bestand an. `detailed` ist die bewusste Ausnahme, nicht die bequeme Voreinstellung.
 */
export class AliasEventModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  public aliasKey = '';           // die Document-ID des Alias
  public space = '';
  public at = '';                 // StoreDateTime (yyyyMMddHHmmss)

  public referrer = '';           // nur der HOST, nie die volle URL
  public userAgent = '';
  /** SHA-256 über IP + tagesrotierendes Salt — ein Pseudonym, keine Anonymisierung. */
  public ipHash = '';
  public uid = '';                // leer, wenn der Aufruf nicht angemeldet erfolgte

  /**
   * ACHTUNG — echter Firestore-`Timestamp`, NICHT die sonst übliche StoreDate-Zeichenkette.
   * Die native TTL-Policy akzeptiert nur ein Timestamp-Feld; eine Zeichenkette liefe nie ab,
   * und genau hier wäre das eine unbefristete Sammlung von Personendaten.
   */
  public expiresAt?: Timestamp;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AliasEventCollection = 'aliasEvents';
export const AliasEventModelName = 'aliasEvent';
