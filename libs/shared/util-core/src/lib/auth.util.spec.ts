import { PrivacyAccessor, RoleName, Roles, UserModel } from '@bk2/shared-models';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAuthorization,
  hasRole,
  isAdmin,
  isPrivileged,
  isPrivilegedOr,
  isVisibleToUser
} from './auth.util';
import * as logUtil from './log.util';

// Mock the log.util module
vi.mock('./log.util', () => ({
  die: vi.fn()
}));

describe('auth.util', () => {
  const mockDie = vi.mocked(logUtil.die);

  // Helper function to create a test user with specific roles
  const createUserWithRoles = (roles: Partial<Roles>): UserModel => ({
      key: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      roles: {
          registered: false,
          privileged: false,
          contentAdmin: false,
          resourceAdmin: false,
          eventAdmin: false,
          memberAdmin: false,
          treasurer: false,
          admin: false,
          groupAdmin: false,
          ...roles
      },
      // Add other required UserModel properties as needed
  } as unknown as UserModel);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAuthorization', () => {
    it('should return true when no user and public role is allowed', () => {
      const result = checkAuthorization(['public']);
      expect(result).toBe(true);
    });

    it('should return false when no user and public role is not allowed', () => {
      const result = checkAuthorization(['admin']);
      expect(result).toBe(false);
    });

    it('should return true when user has one of the allowed roles', () => {
      const user = createUserWithRoles({ admin: true });
      const result = checkAuthorization(['admin', 'memberAdmin'], user);
      expect(result).toBe(true);
    });

    it('should return false when user does not have any allowed roles', () => {
      const user = createUserWithRoles({ registered: true });
      const result = checkAuthorization(['admin', 'memberAdmin'], user);
      expect(result).toBe(false);
    });

    it('should return true when user has multiple allowed roles', () => {
      const user = createUserWithRoles({ admin: true, memberAdmin: true });
      const result = checkAuthorization(['admin'], user);
      expect(result).toBe(true);
    });

    it('should handle empty allowed roles array', () => {
      const user = createUserWithRoles({ admin: true });
      const result = checkAuthorization([], user);
      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true when role is undefined', () => {
      const user = createUserWithRoles({});
      const result = hasRole(undefined, user);
      expect(result).toBe(true);
    });

    it('should return true for "none" role', () => {
      const user = createUserWithRoles({});
      const result = hasRole('none', user);
      expect(result).toBe(true);
    });

    it('should return true when user has registered role and checks for registered', () => {
      const user = createUserWithRoles({ registered: true });
      const result = hasRole('registered', user);
      expect(result).toBe(true);
    });

    it('should return true when user has admin role and checks for registered (admin includes registered)', () => {
      const user = createUserWithRoles({ admin: true });
      const result = hasRole('registered', user);
      expect(result).toBe(true);
    });

    it('should return true when user has privileged role and checks for privileged', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = hasRole('privileged', user);
      expect(result).toBe(true);
    });

    it('should return true when user has admin role and checks for privileged (admin includes privileged)', () => {
      const user = createUserWithRoles({ admin: true });
      const result = hasRole('privileged', user);
      expect(result).toBe(true);
    });

    it('should return true when user has memberAdmin role and checks for memberAdmin', () => {
      const user = createUserWithRoles({ memberAdmin: true });
      const result = hasRole('memberAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has admin role and checks for memberAdmin (admin includes memberAdmin)', () => {
      const user = createUserWithRoles({ admin: true });
      const result = hasRole('memberAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has contentAdmin role and checks for contentAdmin', () => {
      const user = createUserWithRoles({ contentAdmin: true });
      const result = hasRole('contentAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has resourceAdmin role and checks for resourceAdmin', () => {
      const user = createUserWithRoles({ resourceAdmin: true });
      const result = hasRole('resourceAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has eventAdmin role and checks for eventAdmin', () => {
      const user = createUserWithRoles({ eventAdmin: true });
      const result = hasRole('eventAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has treasurer role and checks for treasurer', () => {
      const user = createUserWithRoles({ treasurer: true });
      const result = hasRole('treasurer', user);
      expect(result).toBe(true);
    });

    it('should return true when user has groupAdmin role and checks for groupAdmin', () => {
      const user = createUserWithRoles({ groupAdmin: true });
      const result = hasRole('groupAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has admin role and checks for admin', () => {
      const user = createUserWithRoles({ admin: true });
      const result = hasRole('admin', user);
      expect(result).toBe(true);
    });

    it('should return true when no user and checks for public role', () => {
      const result = hasRole('public');
      expect(result).toBe(true);
    });

    it('should return false when user exists and checks for public role', () => {
      const user = createUserWithRoles({ registered: true });
      const result = hasRole('public', user);
      expect(result).toBe(false);
    });

    it('should return false when user does not have required role', () => {
      const user = createUserWithRoles({ registered: true });
      const result = hasRole('admin', user);
      expect(result).toBe(false);
    });

    it('should call die for unknown role', () => {
      const user = createUserWithRoles({});
      hasRole('unknownRole' as RoleName, user);
      expect(mockDie).toHaveBeenCalledWith('AuthUtil.hasRole: unknown role claimed: unknownRole');
    });
  });

  describe('isAdmin', () => {
    it('should return true when user has admin role', () => {
      const user = createUserWithRoles({ admin: true });
      const result = isAdmin(user);
      expect(result).toBe(true);
    });

    it('should return false when user does not have admin role', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = isAdmin(user);
      expect(result).toBe(false);
    });

    it('should return false when no user provided', () => {
      const result = isAdmin();
      expect(result).toBe(false);
    });
  });

  describe('isPrivileged', () => {
    it('should return true when user has privileged role', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = isPrivileged(user);
      expect(result).toBe(true);
    });

    it('should return true when user has admin role (admin includes privileged)', () => {
      const user = createUserWithRoles({ admin: true });
      const result = isPrivileged(user);
      expect(result).toBe(true);
    });

    it('should return false when user does not have privileged or admin role', () => {
      const user = createUserWithRoles({ registered: true });
      const result = isPrivileged(user);
      expect(result).toBe(false);
    });

    it('should return false when no user provided', () => {
      const result = isPrivileged();
      expect(result).toBe(false);
    });
  });

  describe('isPrivilegedOr', () => {
    it('should return true when user has privileged role', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = isPrivilegedOr('memberAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has the specified role', () => {
      const user = createUserWithRoles({ memberAdmin: true });
      const result = isPrivilegedOr('memberAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has both privileged and specified role', () => {
      const user = createUserWithRoles({ privileged: true, memberAdmin: true });
      const result = isPrivilegedOr('memberAdmin', user);
      expect(result).toBe(true);
    });

    it('should return true when user has admin role (admin includes privileged)', () => {
      const user = createUserWithRoles({ admin: true });
      const result = isPrivilegedOr('memberAdmin', user);
      expect(result).toBe(true);
    });

    it('should return false when user has neither privileged nor specified role', () => {
      const user = createUserWithRoles({ registered: true });
      const result = isPrivilegedOr('memberAdmin', user);
      expect(result).toBe(false);
    });

    it('should return false when no user provided', () => {
      const result = isPrivilegedOr('memberAdmin');
      expect(result).toBe(false);
    });
  });

  describe('isVisibleToUser', () => {
    it('should return true for public privacy when no user', () => {
      const result = isVisibleToUser('public');
      expect(result).toBe(true);
    });

    it('should return false for registered privacy when no user', () => {
      const result = isVisibleToUser('registered');
      expect(result).toBe(false);
    });

    it('should return true for registered privacy when user is registered', () => {
      const user = createUserWithRoles({ registered: true });
      const result = isVisibleToUser('registered', user);
      expect(result).toBe(true);
    });

    it('should return true for privileged privacy when user is privileged', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = isVisibleToUser('privileged', user);
      expect(result).toBe(true);
    });

    it('should return true for admin privacy when user is admin', () => {
      const user = createUserWithRoles({ admin: true });
      const result = isVisibleToUser('admin', user);
      expect(result).toBe(true);
    });

    it('should return false for privileged privacy when user is only registered', () => {
      const user = createUserWithRoles({ registered: true });
      const result = isVisibleToUser('privileged', user);
      expect(result).toBe(false);
    });

    it('should return false for admin privacy when user is only privileged', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = isVisibleToUser('admin', user);
      expect(result).toBe(false);
    });

    it('should call die for unknown privacy accessor', () => {
      const user = createUserWithRoles({});
      isVisibleToUser('unknownAccessor' as PrivacyAccessor, user);
      expect(mockDie).toHaveBeenCalledWith('AuthUtil.isVisibleToUser: unknown privacy accessor: unknownAccessor');
    });

    it('should respect role hierarchy - admin can see privileged content', () => {
      const user = createUserWithRoles({ admin: true });
      const result = isVisibleToUser('privileged', user);
      expect(result).toBe(true);
    });

    it('should respect role hierarchy - admin can see registered content', () => {
      const user = createUserWithRoles({ admin: true });
      const result = isVisibleToUser('registered', user);
      expect(result).toBe(true);
    });

    it('should respect role hierarchy - privileged can see registered content', () => {
      const user = createUserWithRoles({ privileged: true });
      const result = isVisibleToUser('registered', user);
      expect(result).toBe(true);
    });
  });
});