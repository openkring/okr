import { GroupModel } from '@okr/shared-models';
import { fill, ReportFinding } from '@okr/shared-util-core';

import { findDuplicateGroups, findGroupKeyIssues } from './group.util';

/**
 * Already-translated templates for the group hygiene report. This util is pure and cannot translate,
 * so the caller resolves the i18n keys and passes the strings in. Placeholders use single braces
 * (see `fill`).
 */
export interface GroupHygieneTexts {
  /** `{count}` groups with practically the same name, `{groups}` their names with keys */
  duplicate: string;
  /** `{alias}` the chat alias, `{others}` the other group keys claiming it */
  aliasCollision: string;
  /** `{tenantId}` the tenant prefix a derived name would start with */
  unsafeCharacters: string;
  /** `{tenantId}` the missing prefix */
  missingTenantPrefix: string;
}

/** The group detail page. */
function groupUrl(okey: string): string {
  return `/group-view/${okey}`;
}

/**
 * Builds the report findings of the group hygiene check: groups that exist twice, and group keys that
 * cannot safely carry the ids derived from them (folder, page and chat names).
 *
 * A report only: a group key is referenced all over the data, so it cannot be renamed automatically.
 * Each finding opens the group (first group for a duplicate pair).
 */
export function groupHygieneFindings(groups: GroupModel[], tenantId: string, texts: GroupHygieneTexts): ReportFinding[] {
  const findings: ReportFinding[] = [];

  for (const dup of findDuplicateGroups(groups)) {
    findings.push({
      id: dup.groups.map(g => g.okey).join('/'),
      title: dup.groups[0].name,
      detail: fill(texts.duplicate, {
        count: dup.groups.length,
        groups: dup.groups.map(g => `${g.name} (${g.okey})`).join(', '),
      }),
      url: groupUrl(dup.groups[0].okey),
    });
  }

  for (const issue of findGroupKeyIssues(groups, tenantId)) {
    const detail = issue.kind === 'aliasCollision'
      ? fill(texts.aliasCollision, { alias: issue.aliasLocalpart, others: issue.collidesWith.join(', ') })
      : issue.kind === 'unsafeCharacters'
        ? fill(texts.unsafeCharacters, { tenantId })
        : fill(texts.missingTenantPrefix, { tenantId });
    findings.push({ id: issue.okey, title: issue.name, detail, url: groupUrl(issue.okey) });
  }

  return findings;
}
