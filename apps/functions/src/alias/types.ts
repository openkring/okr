import type { AliasSpaceModel, AliasTargetType, AliasTrackingSetting } from '@okr/shared-models';

/**
 * Alles, was `mintAlias` braucht, um einen Alias zu prägen.
 *
 * `now` wird hereingereicht statt in der Funktion gebildet: sonst hängt jeder Test an der
 * Systemuhr, und `createdAt` ist ein Feld, das in einer Datenauskunft auftaucht.
 */
export interface MintParams {
  readonly tenantId: string;
  readonly space: AliasSpaceModel;
  readonly targetType: AliasTargetType;
  readonly targetUrl: string;
  readonly targetKey: string;
  /** Menschenlesbares Original — die Grundlage des Reverse-Lookup von `resolveAlias`. */
  readonly original: string;
  readonly notes: string;
  /** `person.<okey>` des Aufrufers. */
  readonly createdBy: string;
  /** StoreDateTime (yyyyMMddHHmmss). */
  readonly now: string;
  /** Vanity-Handle; nur zulässig, wenn `space.allowCustom`. */
  readonly requestedAlias?: string;
  readonly validUntil?: string;
  readonly maxUses?: number;
  readonly trackingLevel?: AliasTrackingSetting;
}

export interface MintedAlias {
  readonly alias: string;
  readonly docId: string;
}
