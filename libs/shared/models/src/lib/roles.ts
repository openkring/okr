/**
 * Role-based Authorization
 * see https://fireship.io/lessons/role-based-authorization-with-firestore-nosql-and-angular-5/
 */
export type Roles = {
  anonymous?: boolean;
  registered?: boolean;
  privileged?: boolean;
  contentAdmin?: boolean;
  resourceAdmin?: boolean;
  eventAdmin?: boolean;
  memberAdmin?: boolean;
  groupAdmin?: boolean;
  treasurer?: boolean;
  admin?: boolean;
};

// had to move type definition of RoleName into env.ts to avoid circular dependency
export type AdminRole = 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin';
export type RoleLevel = 'anonymous' | 'registered' | 'privileged' | 'admin';
