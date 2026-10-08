/**
 * Pure rules for the treasurer contact printed on finance PDFs (invoice, Mahnung, payment confirmation): the
 * person who currently holds the tenant's treasurer responsibility and that person's favourite email and phone.
 */
import type { AddressModel } from '@okr/shared-models';
import { pickFavoriteByChannel } from '@okr/shared-util-functions';

export interface AvatarRef { key?: string; name1?: string; name2?: string; modelType?: string; label?: string }

export interface ResponsibilityLike {
  responsibleAvatar?: AvatarRef;
  delegateAvatar?: AvatarRef;
  delegateValidFrom?: string;
  delegateValidTo?: string;
}

/** What the templates read as `contact.*`; empty strings render nothing. */
export interface TreasurerContact { name: string; email: string; phone: string }

/** The responsibility's id of a tenant's treasurer: one per tenant, valid for all its books. */
export const treasurerResponsibilityKey = (tenantId: string): string => `${tenantId}-treasurer`;

/**
 * Who acts for the responsibility today: the delegate when one is set and today lies in its period (an empty
 * bound is open), otherwise the responsible person.
 */
export function activeResponsible(r: ResponsibilityLike | undefined, today: string): AvatarRef | undefined {
  const delegate = r?.delegateAvatar;
  if (delegate?.key) {
    const from = r?.delegateValidFrom || '00000000';
    const to = r?.delegateValidTo || '99991231';
    if (from <= today && today <= to) return delegate;
  }
  return r?.responsibleAvatar;
}

/** Name plus favourite email and phone of the person, from that person's addresses (any missing field is ''). */
export function treasurerContactFields(person: AvatarRef | undefined, addresses: AddressModel[]): TreasurerContact {
  if (!person?.key) return { name: '', email: '', phone: '' };
  const name = (person.label || [person.name1, person.name2].filter((s) => !!s).join(' ')).trim();
  return {
    name,
    email: pickFavoriteByChannel(addresses, 'email')?.email ?? '',
    phone: pickFavoriteByChannel(addresses, 'phone')?.phone ?? '',
  };
}
