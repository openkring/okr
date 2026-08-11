import { getEffectiveAccessorForAddress, PersonPrivacyPreferences, PrivacyAccessor, PrivacySettings, RoleName, Roles, UserModel } from "@okr/shared-models";
import { die } from "./log.util";
import { debugMessage } from "./debug.util";

/**
 * Determines if the user has a matching role.
 * @param user 
 * @param allowedRoles a list of allowed roles to check for
 * @returns true if at least one role matches allowed roles
*/
export function checkAuthorization(allowedRoles: RoleName[], currentUser?: UserModel): boolean {
  if (!currentUser) {
    return allowedRoles.includes('public');
  }
  for (const role of allowedRoles) {
    if (currentUser.roles[role as keyof Roles] === true) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether the current user a specific role.
 * @param role the role to check for
 * @returns true if the user has the role
 */
export function hasRole(role: RoleName | undefined, currentUser?: UserModel): boolean {
  if (!role) return true;
  let roles: RoleName[] = [];
  switch(role) {  // add additional roles that also have access
    case 'none': return true;
    case 'anonymous': return !currentUser; // visible only to unauthenticated users
    case 'public': return true; // visible to everyone, authenticated or not
    // 'kiosk' counts as registered: it is a real logged-in account, and a kiosk-only user is
    // route-locked to /trips anyway (kioskLock.guard), so this widens nothing it can reach.
    // Without it, every menu item gated 'registered' vanishes on the kiosk (empty context menu).
    case 'registered': roles = ['registered', 'privileged', 'contentAdmin', 'resourceAdmin', 'eventAdmin', 'memberAdmin', 'treasurer', 'admin', 'kiosk']; break;
    case 'privileged': roles = ['privileged', 'admin']; break;
    case 'memberAdmin': roles = ['memberAdmin', 'admin']; break;
    case 'contentAdmin': roles = ['contentAdmin', 'admin']; break;
    case 'resourceAdmin': roles = ['resourceAdmin', 'admin']; break;
    case 'eventAdmin': roles = ['eventAdmin', 'admin']; break;
    case 'treasurer': roles = ['treasurer', 'admin']; break;
    case 'admin':  roles = ['admin']; break;
    case 'groupAdmin': roles = ['groupAdmin', 'admin']; break;
    case 'kiosk': roles = ['kiosk', 'admin']; break;
    case 'auditor': roles = ['auditor', 'admin']; break;
    case 'tester': roles = ['tester', 'admin']; break;
    default: die('AuthUtil.hasRole: unknown role claimed: ' + role);
  }
  return checkAuthorization(roles, currentUser);
}

export function isAdmin(currentUser?: UserModel): boolean {
  return hasRole('admin', currentUser);
}

export function isPrivileged(currentUser?: UserModel): boolean {
  return hasRole('privileged', currentUser);
}

export function isPrivilegedOr(roleName: RoleName, currentUser?: UserModel): boolean {
  return hasRole('privileged', currentUser) || hasRole(roleName, currentUser);
}

/**
 * Determines whether the user's only role is `kiosk` (no other role flag is true).
 * Such users are locked to the /trips page (see kioskLockGuard). An admin — who also
 * has kiosk-level access — or a kiosk user with any additional role is NOT kiosk-only.
 * @param currentUser the user to check
 * @returns true if kiosk is the sole true role
 */
export function isKioskOnly(currentUser?: UserModel): boolean {
  if (!currentUser) return false;
  const roles = currentUser.roles;
  if (roles.kiosk !== true) return false;
  return Object.entries(roles).every(([key, value]) => key === 'kiosk' || value !== true);
}

// privacy access checks
export function isVisibleToUser(privacyAccessor?: PrivacyAccessor, currentUser?: UserModel): boolean {
  if (!privacyAccessor) return false;
  switch (privacyAccessor) {
    case 'public':
      return hasRole('public', currentUser);
    case 'registered':
      return hasRole('registered', currentUser);
    case 'privileged':
      return hasRole('privileged', currentUser);
    case 'admin':
      return hasRole('admin', currentUser);
    default:
      die('AuthUtil.isVisibleToUser: unknown privacy accessor: ' + privacyAccessor);
  }
}

/**
 * Visibility of a vault-backed sensitive field (ssn/dob — spec 1.19 Phase 4, D9).
 *
 * These fields live in the addresses vault, where memberAdmin is an authorized reader
 * AND writer: firestore.rules `canReadVault`/`canWriteSensitive` grant it (D-P4-1 as
 * amended), and PersonService.loadSensitive hydrates it via the getAddressView callable.
 * The PrivacyAccessor ladder has no memberAdmin rung, though — a tenant floor of
 * 'privileged' or 'admin' on showTaxId/showDateOfBirth therefore hid the field from
 * exactly the role that maintains it. Grant memberAdmin explicitly instead of widening
 * the accessor ladder (which would leak into every other privacy check).
 * @param privacyAccessor the tenant/person floor for this field class
 * @param currentUser the user to check
 * @returns true if the field may be shown
 */
export function isSensitiveFieldVisible(privacyAccessor?: PrivacyAccessor, currentUser?: UserModel): boolean {
  return isVisibleToUser(privacyAccessor, currentUser) || hasRole('memberAdmin', currentUser);
}

/**
 * Visibility of a vault-backed sensitive field (ssn/dob/dod) on a PERSON form —
 * the full §A3 formula, not just the tenant floor.
 *
 * Gating on the tenant floor alone (`isSensitiveFieldVisible(priv().showDateOfBirth)`)
 * promised more than the vault delivers: with scs's `showDateOfBirth: 'registered'`
 * the dob field rendered for every member, while PersonService.loadSensitive —
 * correctly applying the channel floor and the person's preference — returned
 * nothing, so the field sat there empty. This is the same computation the server
 * uses, so the field is shown exactly when it can be filled.
 *
 * Owner and memberAdmin bypass the formula: they are the authorized editors of
 * these values (D9 / D-P4-1 as amended) and read them raw.
 *
 * @param channel     the vault channel — 'ssn' | 'dob' | 'dod'
 * @param person      the person being viewed: their `usage*` preferences and `okey`
 * @param settings    the tenant's PrivacySettings floors
 * @param currentUser the viewer
 */
export function isVaultFieldVisible(
  channel: string,
  person?: Partial<PersonPrivacyPreferences> & { okey?: string },
  settings?: Partial<PrivacySettings>,
  currentUser?: UserModel,
): boolean {
  if (!currentUser) return false;
  if (person?.okey && person.okey === currentUser.personKey) return true;   // owner reads their own vault
  const accessor = getEffectiveAccessorForAddress({ addressChannel: channel }, 'person', person, settings);
  return isSensitiveFieldVisible(accessor, currentUser);
}

export function areNotesVisible(currentUser?: UserModel, priv?: PrivacySettings, notes?: string, readonly?: boolean): boolean {
  if (!currentUser || !priv) return false;
  debugMessage(`auth.util.isNotesVisible(readonly=${readonly}, showNotes=${priv.showNotes}, notes=<${notes}>) -> ${isVisibleToUser(priv.showNotes, currentUser)}`, currentUser);
  if (isVisibleToUser(priv.showNotes, currentUser)) { // if the user has the permission to see notes, then check if there are notes to show in readonly mode, or show always in edit mode
    if (readonly) { // in readonly mode, only visible if there are notes.
      return (notes && notes.length > 0) ? true : false;
    } else {
      return true; // always visible in edit mode.
    };
  }
  return false;
}

export function areTagsVisible(currentUser?: UserModel, priv?: PrivacySettings, tags?: string, readonly?: boolean): boolean {
  if (!currentUser || !priv) return false;
  debugMessage(`auth.util.isTagsVisible(readonly=${readonly}, showTags=${priv.showTags}, tags=<${tags}>) -> ${isVisibleToUser(priv.showTags, currentUser)}`, currentUser);
  if (isVisibleToUser(priv.showTags, currentUser)) {
    if (readonly) { // in readonly mode, only visible if there are tags.
      return (tags && tags.length > 0) ? true : false;
    } else {
      return true; // always visible in edit mode.
    };
  }
  return false;
}