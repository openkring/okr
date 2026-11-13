import { PUBLIC_USAGE, sharesTenant, type GroupPersonDoc, type PublicPerson } from './group-people';

/** The fields of an avatar (`AvatarInfo`) on a role the resolver reads. */
export interface RoleAvatarDoc {
  key?: string;
  name1?: string;
  name2?: string;
  modelType?: string;
}

/** The fields of a `responsibilities` document the resolver reads. */
export interface RoleDoc {
  name?: string;
  /** public contact address of the role (a club alias); may be published */
  email?: string;
  tenants?: string[];
  isArchived?: boolean;
  responsibleAvatar?: RoleAvatarDoc | null;
  delegateAvatar?: RoleAvatarDoc | null;
}

/**
 * The public holders of one or more roles for a website people section (spec 1.153 §13.1), from
 * already-loaded docs, as the app's people section resolves them (`people-section.store.ts`):
 * - for each role in `roleIds` order (missing, archived or foreign roles skipped): the responsible, then
 *   the delegate — person avatars only; a person holding several roles appears once, at the first,
 * - whose person is of a site tenant, not archived, not deceased and has `usageName === Public` —
 *   everyone else is left out silently, office holders included,
 * - names from the role's avatar (as the app), `label` = the names of every listed role the person
 *   holds, joined with ', ' (the app's function label),
 * - `email` = the address of the first such role that has one (the role alias, never a personal
 *   address); mapSection emits it only when the section's info shows email,
 * - `showImage` only when `usageImages` is Public (missing = the model default, Public).
 * Validity dates (validFrom/To, delegateValidFrom/To) are ignored, as in the app.
 * @param roles role key → role doc (missing = skipped)
 * @param persons person key → person doc (missing = left out)
 */
export function resolveRolePeople(
  roleIds: string[],
  roles: ReadonlyMap<string, RoleDoc>,
  persons: ReadonlyMap<string, GroupPersonDoc>,
  siteTenants: string[],
): PublicPerson[] {
  const out: PublicPerson[] = [];
  const byKey = new Map<string, PublicPerson>();
  const names = new Map<string, string[]>();
  for (const roleId of [...new Set(roleIds)]) {
    const role = roles.get(roleId);
    if (!role || role.isArchived === true || !sharesTenant(role.tenants, siteTenants)) continue;
    const roleName = role.name?.trim() ?? '';
    const roleEmail = role.email?.trim() ?? '';
    for (const avatar of [role.responsibleAvatar, role.delegateAvatar]) {
      const key = avatar?.key;
      if (!avatar || !key || avatar.modelType !== 'person') continue;
      const person = persons.get(key);
      if (!person || person.isArchived === true || person.isDeceased === true || !sharesTenant(person.tenants, siteTenants)) continue;
      if (person.usageName !== PUBLIC_USAGE) continue;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          key,
          firstName: avatar.name1 ?? '',
          lastName: avatar.name2 ?? '',
          label: '',
          showImage: person.usageImages === undefined || person.usageImages === PUBLIC_USAGE,
        };
        byKey.set(key, entry);
        names.set(key, []);
        out.push(entry);
      }
      const list = names.get(key) as string[];
      if (roleName && !list.includes(roleName)) list.push(roleName);
      if (roleEmail && !entry.email) entry.email = roleEmail;
    }
  }
  for (const p of out) p.label = (names.get(p.key) ?? []).join(', ');
  return out;
}
