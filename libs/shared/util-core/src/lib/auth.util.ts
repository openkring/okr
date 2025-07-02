import { PrivacyAccessor, RoleName, Roles, UserModel } from "@bk2/shared/models";
import { die } from "./log.util";

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
  for (const _role of allowedRoles) {
    if (currentUser.roles[_role as keyof Roles] === true) {
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
  let _roles: RoleName[] = [];
  switch(role) {  // add additional roles that also have access
    case 'none': return true;
    case 'registered': _roles = ['registered', 'privileged', 'contentAdmin', 'resourceAdmin', 'eventAdmin', 'memberAdmin', 'treasurer', 'admin']; break;
    case 'privileged': _roles = ['privileged', 'admin']; break;
    case 'memberAdmin': _roles = ['memberAdmin', 'admin']; break;
    case 'contentAdmin': _roles = ['contentAdmin', 'admin']; break;
    case 'resourceAdmin': _roles = ['resourceAdmin', 'admin']; break;
    case 'eventAdmin': _roles = ['eventAdmin', 'admin']; break;
    case 'treasurer': _roles = ['treasurer', 'admin']; break;
    case 'admin':  _roles = ['admin']; break;
    case 'public': _roles = ['public']; break; // only non-authenticated users
    case 'groupAdmin': _roles = ['groupAdmin', 'admin']; break;
    default: die('AuthUtil.hasRole: unknown role claimed: ' + role);
  }
  return checkAuthorization(_roles, currentUser);
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

// privacy access checks
export function isVisibleToUser(privacyAccessor: PrivacyAccessor, currentUser?: UserModel): boolean {
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