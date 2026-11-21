import { GroupModel, NewsletterSubscriptionModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';
import { isAdminMember, isNewsletterGroup } from '@okr/subject-group-util';

/**
 * Whether the subscription is active: not archived and without an exit date. The same rule as the server
 * (`isActiveSubscription` in functions/newsletter/tenant-link.logic.ts), which sets `dateOfExit` to the day
 * it ends a subscription — any exit date means ended, so the list never shows whom a send would refuse.
 */
export function isActiveSubscription(subscription: NewsletterSubscriptionModel): boolean {
  if (subscription.isArchived) return false;
  return (subscription.dateOfExit ?? '') === '';
}

/** The active subscriptions, sorted by the subscriber's name. */
export function activeSubscribers(subscriptions: NewsletterSubscriptionModel[]): NewsletterSubscriptionModel[] {
  return subscriptions
    .filter((s) => isActiveSubscription(s))
    .sort((a, b) => (a.personName ?? '').localeCompare(b.personName ?? ''));
}

/** The live (not archived) newsletter groups among `groups`. */
export function newsletterGroups(groups: GroupModel[]): GroupModel[] {
  return groups.filter((g) => !g.isArchived && isNewsletterGroup(g));
}

/**
 * Who sees a newsletter's subscribers (spec 1.169 §5.8): member admins, privileged users (admins
 * included) and the newsletter's own admins. Mirrors the `newsletterSubscriptions` read rule.
 */
export function canSeeSubscribers(group: GroupModel | undefined, user: UserModel | undefined): boolean {
  if (!group || !user) return false;
  if (hasRole('memberAdmin', user) || hasRole('privileged', user)) return true;
  return isAdminMember(group, user.personKey);
}

/**
 * Whether the user may send a newsletter by post. The letters carry postal addresses, which the
 * address vault keeps from a newsletter admin without one of these roles; the server refuses the
 * same (`newsletterSendCheck`).
 */
export function mayPostNewsletter(user: UserModel | undefined): boolean {
  return hasRole('memberAdmin', user) || hasRole('privileged', user);
}
