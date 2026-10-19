import { RoleName } from '@okr/shared-models';

/**
 * Every RoleName, once. Typed as a Record so the compiler rejects a RoleName added to the union
 * but missing here (and the other way round). The order is the order the role select shows.
 */
const ROLE_NAME_FLAGS: Record<RoleName, true> = {
  none: true,
  anonymous: true,
  public: true,
  registered: true,
  privileged: true,
  contentAdmin: true,
  resourceAdmin: true,
  memberAdmin: true,
  eventAdmin: true,
  treasurer: true,
  admin: true,
  groupAdmin: true,
  kiosk: true,
  tripAdmin: true,
  auditor: true,
  tester: true,
};

/** Roles that grant nothing beyond plain membership: they are no «erweiterte Rolle». */
const BASE_ROLES: readonly RoleName[] = ['none', 'anonymous', 'public', 'registered'];

/** The roles the «Erweiterte Rollen» select offers: every role that grants more than plain membership. */
export const EXTENDED_ROLE_OPTIONS: RoleName[] = (Object.keys(ROLE_NAME_FLAGS) as RoleName[]).filter(r => !BASE_ROLES.includes(r));
