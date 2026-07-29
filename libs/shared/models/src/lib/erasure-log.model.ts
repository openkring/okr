import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** What caused an erasure — see the membership-lifecycle spec §6/§7/§8. */
export type ErasureTrigger = 'self' | 'partial' | 'lifecycle' | 'admin';

/**
 * Evidence that a data-subject erasure ran (privacy 1.19, Phase 5B).
 *
 * Written by Cloud Functions only, readable by the tenant's admins, never writable from
 * a client. It deliberately holds **no personal data**: no name, no e-mail, no
 * `personKey`, no uid — the pseudonym is a salted hash and the counts are per collection.
 *
 * It also says nothing about whether the person record itself survived. That would tell
 * a reading admin the member still belongs to another tenant, which D-P5-2 forbids just
 * as much as naming the tenant would.
 */
export class ErasureLogModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public tenantId = '';                    // the tenant the erasure was scoped to
  public executedAt = '';                  // store date-time (yyyymmddHHmmss)
  public pseudonym = '';                   // 'Gelöschtes Mitglied #<8 hex>' — salted, per tenant
  public counts: Record<string, number> = {};   // documents touched, per collection
  public trigger: ErasureTrigger = 'self';
}

export const ErasureLogCollection = 'erasure-log';
export const ErasureLogModelName = 'erasureLog';
