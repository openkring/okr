import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';

import type { AliasCharset, AliasTargetType, AliasTrackingLevel } from '@okr/shared-models';

/** Der i18n-Scope, unter dem die Item-Labels der Kategorien aufgelöst werden. */
const I18N_SCOPE = '@system/alias/util';

const TARGET_TYPES: AliasTargetType[] = ['url', 'model', 'none'];
const TRACKING_LEVELS: AliasTrackingLevel[] = ['off', 'counter', 'detailed'];
const TRACKING_SETTINGS = ['inherit', ...TRACKING_LEVELS];
const CHARSETS: AliasCharset[] = ['base32-safe', 'base62', 'lower-numeric'];
const SPACE_KINDS = ['redirect', 'lookup'];

const TARGET_TYPE_ICONS: Record<string, string> = { url: 'link', model: 'list', none: 'help-circle' };
const TRACKING_ICONS: Record<string, string> = {
  inherit: 'help-circle', off: 'close', counter: 'chart', detailed: 'search',
};

function category(tenantId: string, name: string, items: string[], icons: Record<string, string> = {}): CategoryListModel {
  const list = new CategoryListModel(tenantId);
  list.name = name;
  list.i18n = I18N_SCOPE;
  list.translateItems = true;
  list.items = items.map((item) => new CategoryItemModel(item, icons[item] ?? 'help-circle'));
  return list;
}

/**
 * `'words'` fehlt hier ABSICHTLICH: das Charset ist im Modell vorgesehen, hat aber keine
 * Wortliste (Spec, offener Punkt). Eine Auswahl anzubieten, die zur Laufzeit einen leeren
 * Alphabet-String liefert, wäre eine Falle — `generateAliasCode` würde leere Codes prägen.
 */
export function aliasCharsetCategory(tenantId: string): CategoryListModel {
  return category(tenantId, 'charset', CHARSETS);
}

export function aliasTargetTypeCategory(tenantId: string): CategoryListModel {
  return category(tenantId, 'targetType', TARGET_TYPES, TARGET_TYPE_ICONS);
}

/** Auf dem Alias — `inherit` übernimmt die Vorgabe des Space. */
export function aliasTrackingSettingCategory(tenantId: string): CategoryListModel {
  return category(tenantId, 'trackingSetting', TRACKING_SETTINGS, TRACKING_ICONS);
}

/** Auf dem Space — hier gibt es kein `inherit`, der Space IST die Vorgabe. */
export function aliasTrackingLevelCategory(tenantId: string): CategoryListModel {
  return category(tenantId, 'trackingLevel', TRACKING_LEVELS, TRACKING_ICONS);
}

export function aliasSpaceKindCategory(tenantId: string): CategoryListModel {
  return category(tenantId, 'kind', SPACE_KINDS, { redirect: 'link', lookup: 'search' });
}
