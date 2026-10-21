import { RoleName } from '@okr/shared-models';
import { OPERATOR_TENANT_ID, ReportKind } from '@okr/shared-util-core';

import { AOC_HUB_I18N_KEYS } from './aoc-i18n';

/** Spec 1.101 §3 — the four AOC hub areas (Zugang, Betrieb, Konfiguration, Datenqualität). */
export type AocArea = 'access' | 'ops' | 'config' | 'data';

export const AOC_AREA_ROUTES: Record<AocArea, string> = {
  access: '/aoc/access',
  ops: '/aoc/ops',
  config: '/aoc/config',
  data: '/aoc/data',
};

/** The four areas in hub (segment) order. */
export const AOC_AREA_IDS: readonly AocArea[] = ['access', 'ops', 'config', 'data'];

export interface AocCard {
  id: string;
  area: AocArea;
  kind: ReportKind;
  labelKey: string;
  effectKey: string;
  /** A URL to navigate to, or an operation id the hub store dispatches. */
  target: { route: string } | { operation: string };
  roleNeeded: RoleName;
  /** The feature block that owns the target; the card is hidden when it is off for the tenant. */
  featureBlock: string;
  /** Visible only for these tenants (matched against ctx.tenantId). */
  tenants?: string[];
  /** Hidden in these apps (matched against ctx.tenantId). */
  notOnApps?: string[];
}

/** The platform tenant (kring-app). There is no shared constant for it in the libs. */
const KRING_TENANT_ID = 'kring';

/** kring-app has no /aoc, /user, /activity or /security routes: only Eskalationen and Features exist there. */
const NOT_ON_KRING = [KRING_TENANT_ID];

type CardOptions = Pick<AocCard, 'tenants' | 'notOnApps'>;

type HubKey = keyof typeof AOC_HUB_I18N_KEYS;

/** A card id is any `<id>` with a `card_<id>_label` key; a typo fails to compile. */
export type AocCardId = HubKey extends infer K ? (K extends `card_${infer I}_label` ? I : never) : never;

function card(
  id: AocCardId,
  area: AocArea,
  kind: ReportKind,
  target: AocCard['target'],
  featureBlock: string,
  options: CardOptions = {},
): AocCard {
  // both template types must be keys of AOC_HUB_I18N_KEYS for every id, else this does not compile
  const labelKey: HubKey = `card_${id}_label`;
  const effectKey: HubKey = `card_${id}_effect`;
  return {
    id,
    area,
    kind,
    labelKey: AOC_HUB_I18N_KEYS[labelKey],
    effectKey: AOC_HUB_I18N_KEYS[effectKey],
    target,
    roleNeeded: 'admin',
    featureBlock,
    ...options,
  };
}

/** Display order = array order. */
export const AOC_AREAS: readonly AocCard[] = [
  card('users', 'access', 'operation', { route: '/user/all/c-users' }, 'user', { notOnApps: NOT_ON_KRING }),
  card('sessions', 'access', 'report', { route: '/aoc/sessions' }, 'aoc', { notOnApps: NOT_ON_KRING }),
  card('register', 'access', 'report', { route: '/security/register' }, 'security', { notOnApps: NOT_ON_KRING }),
  card('privacyAudit', 'access', 'check', { route: '/security/privacy-audit' }, 'security', { notOnApps: NOT_ON_KRING }),
  card('iban', 'access', 'report', { operation: 'iban' }, 'aoc', { notOnApps: NOT_ON_KRING }),
  card('allocation', 'access', 'operation', { route: '/operator/allocation' }, 'aoc', { tenants: [OPERATOR_TENANT_ID] }),
  card('activity', 'ops', 'report', { route: '/activity' }, 'activity', { notOnApps: NOT_ON_KRING }),
  card('emailEvents', 'ops', 'report', { route: '/aoc/email' }, 'aoc', { tenants: [OPERATOR_TENANT_ID] }),
  card('chatMaintenance', 'ops', 'operation', { route: '/operator/chat' }, 'aoc', { tenants: [OPERATOR_TENANT_ID] }),
  card('escalations', 'ops', 'report', { route: '/ticket/all' }, 'business', { tenants: [KRING_TENANT_ID] }),
  card('features', 'config', 'operation', { route: '/tenant/features' }, 'aoc'),
  card('workflow', 'config', 'operation', { route: '/workflow/all/workflow-context' }, 'aoc', { notOnApps: NOT_ON_KRING }),
  card('validate', 'data', 'check', { operation: 'validate' }, 'aoc', { notOnApps: NOT_ON_KRING }),
  card('reindex', 'data', 'check', { operation: 'reindex' }, 'aoc', { notOnApps: NOT_ON_KRING }),
];

export interface AocCardContext {
  tenantId: string;
  isEnabled: (block: string) => boolean;
  hasRole: (role: RoleName) => boolean;
}

export function visibleAocCards(cards: readonly AocCard[], area: AocArea, ctx: AocCardContext): AocCard[] {
  return cards.filter(
    c =>
      c.area === area &&
      (!c.tenants || c.tenants.includes(ctx.tenantId)) &&
      !c.notOnApps?.includes(ctx.tenantId) &&
      ctx.isEnabled(c.featureBlock) &&
      ctx.hasRole(c.roleNeeded),
  );
}

/**
 * The client-side gate of `AocHubStore.run`: an operation may run only when its card is visible to
 * this user (tenant, feature block, role) in some area. The server and the rules still decide.
 */
export function isOperationVisible(cards: readonly AocCard[], operationId: string, ctx: AocCardContext): boolean {
  return AOC_AREA_IDS.some(area =>
    visibleAocCards(cards, area, ctx).some(c => 'operation' in c.target && c.target.operation === operationId));
}
