import { describe, expect, it } from 'vitest';

import { GroupModel } from '@okr/shared-models';

import { groupHygieneFindings, GroupHygieneTexts } from './group-report.util';

const TEXTS: GroupHygieneTexts = {
  duplicate: '{count} Gruppen: {groups}',
  aliasCollision: 'Alias {alias} auch bei {others}',
  unsafeCharacters: 'Unsicher, hiesse {tenantId}_...',
  missingTenantPrefix: 'Kein Praefix {tenantId}_',
};

function makeGroup(okey: string, name: string, overrides: Partial<GroupModel> = {}): GroupModel {
  const group = new GroupModel('scs');
  group.okey = okey;
  group.name = name;
  return Object.assign(group, overrides);
}

describe('groupHygieneFindings', () => {
  it('returns [] for no groups', () => {
    expect(groupHygieneFindings([], 'scs', TEXTS)).toEqual([]);
  });

  it('returns [] for healthy groups', () => {
    expect(groupHygieneFindings([makeGroup('scs_a', 'Alpha'), makeGroup('scs_b', 'Beta')], 'scs', TEXTS)).toEqual([]);
  });

  it('reports two groups with the same name as one finding keyed by both okeys', () => {
    const findings = groupHygieneFindings([makeGroup('scs_v2', 'Vorstand'), makeGroup('scs_v1', 'vorstand')], 'scs', TEXTS);
    expect(findings).toEqual([{
      id: 'scs_v1/scs_v2',
      title: 'vorstand',
      detail: '2 Gruppen: vorstand (scs_v1), Vorstand (scs_v2)',
      url: '/group-view/scs_v1',
    }]);
  });

  it('reports a missing tenant prefix with the group detail url', () => {
    const findings = groupHygieneFindings([makeGroup('ruderer', 'Ruderer')], 'scs', TEXTS);
    expect(findings).toEqual([{
      id: 'ruderer', title: 'Ruderer', detail: 'Kein Praefix scs_', url: '/group-view/ruderer',
    }]);
  });

  it('does not report a seeded unprefixed key', () => {
    expect(groupHygieneFindings([makeGroup('vorstand', 'Vorstandsgruppe')], 'scs', TEXTS)).toEqual([]);
  });

  it('reports unsafe characters', () => {
    const findings = groupHygieneFindings([makeGroup('scs_Zürich', 'Zürich')], 'scs', TEXTS);
    expect(findings).toEqual([{
      id: 'scs_Zürich', title: 'Zürich', detail: 'Unsicher, hiesse scs_...', url: '/group-view/scs_Zürich',
    }]);
  });

  it('reports an alias collision for both groups', () => {
    const findings = groupHygieneFindings([makeGroup('scs_Ab', 'Eins'), makeGroup('scs_ab', 'Zwei')], 'scs', TEXTS);
    expect(findings.map(f => f.id)).toEqual(['scs_Ab', 'scs_ab']);
    expect(findings[0].detail).toBe('Alias group_scs_ab auch bei scs_ab');
    expect(findings[1].detail).toBe('Alias group_scs_ab auch bei scs_Ab');
  });
});
