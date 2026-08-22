import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { AliasTargetType, AliasTrackingSetting } from '@okr/shared-models';

/**
 * Client der beiden Präge-Callables (Teilprojekt 2).
 *
 * Warum das nicht über `FirestoreService` geht: `aliases` ist `allow write: if false`. Die
 * Document-ID ist deterministisch (`<tenant>__<space>__<alias>`), und `createModel()` schreibt
 * mit `setDoc()` — ein Client-Write würde einen bestehenden, womöglich GEDRUCKTEN Alias still
 * überschreiben statt zu kollidieren. Nur `.create()` des Admin SDK wirft. Deshalb prägt
 * ausschliesslich der Server.
 *
 * Die Trennung der beiden Operationen ist die eigentliche Entscheidung (Spec, Entscheid 4):
 * **Ist der Alias die Identität des Ziels oder ein Messpunkt auf dem Weg dorthin?**
 */

export interface MintAliasRequest {
  space: string;
  targetType: AliasTargetType;
  targetUrl?: string;
  targetKey?: string;
  original?: string;
  notes?: string;
  /** Vanity-Handle; nur zulässig, wenn der Space `allowCustom` erlaubt. */
  alias?: string;
  validUntil?: string;
  maxUses?: number;
  trackingLevel?: AliasTrackingSetting;
}

export interface MintAliasSuccess {
  readonly ok: true;
  readonly alias: string;
  readonly url: string;
  /** Nur bei `resolveAlias`: false = ein bestehender Alias wurde wiederverwendet. */
  readonly created: boolean;
}

export interface MintAliasFailure {
  readonly ok: false;
  /** Der HttpsError-Code ohne das `functions/`-Präfix, z.B. `already-exists`. */
  readonly code: string;
  readonly message: string;
}

export type MintAliasResult = MintAliasSuccess | MintAliasFailure;

const GENERIC_FAILURE = 'Der Alias konnte nicht erstellt werden. Bitte versuche es später noch einmal.';

function toFailure(error: unknown): MintAliasFailure {
  const raw = error as { code?: unknown; message?: unknown };
  const code = typeof raw?.code === 'string' ? raw.code.replace(/^functions\//, '') : 'unknown';
  const message = typeof raw?.message === 'string' && raw.message.trim() !== ''
    ? raw.message
    : GENERIC_FAILURE;
  return { ok: false, code, message };
}

@Injectable({ providedIn: 'root' })
export class AliasMintService {
  private readonly env = inject(ENV);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /**
   * Prägt IMMER einen neuen Code — der Messpunkt-Fall. Plakat und Newsletter zeigen auf
   * dasselbe Ziel und zählen getrennt, unterschieden durch `notes`.
   */
  public async createAlias(request: MintAliasRequest): Promise<MintAliasResult> {
    return this.call('createAlias', { ...request, tenantId: this.env.tenantId });
  }

  /**
   * Idempotent — der Identitäts-Fall. Derselbe Trip, dasselbe geteilte Dokument, egal wie oft
   * verlinkt. `original` ist der Schlüssel des Reverse-Lookup und deshalb Pflicht.
   */
  public async resolveAlias(
    request: MintAliasRequest & { original: string },
  ): Promise<MintAliasResult> {
    return this.call('resolveAlias', { ...request, tenantId: this.env.tenantId });
  }

  private async call(name: string, payload: unknown): Promise<MintAliasResult> {
    try {
      const fn = httpsCallable<unknown, { alias: string; url: string; created?: boolean }>(
        this.functions, name,
      );
      const result = await fn(payload);
      return {
        ok: true,
        alias: result.data.alias,
        url: result.data.url,
        created: result.data.created ?? true,
      };
    } catch (error) {
      console.warn(`AliasMintService.${name} failed`, (error as { code?: string })?.code ?? 'unknown');
      return toFailure(error);
    }
  }
}
