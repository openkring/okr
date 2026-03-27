import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ActionSheetController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ContextDiagramConfig, ContextDiagramSection, GroupModelName, MembershipModel, OrgModelName, PersonalRelModel, PersonModelName, ResponsibilityModel, WorkrelModel } from '@bk2/shared-models';
import { getFullName } from '@bk2/shared-util-core';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { AvatarService } from '@bk2/avatar-data-access';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { WorkrelService } from '@bk2/relationship-workrel-data-access';
import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { GROUP_EDIT_MODAL } from '@bk2/subject-group-ui';
import { OrgEditModalComponent } from '@bk2/subject-org-feature';

// ---------------------------------------------------------------------------
// Graph node / edge types
// ---------------------------------------------------------------------------

export interface ContextDiagramNode {
  id: string;           // "modelType.bkey"
  name: string;
  symbolSize: number;
  symbolUrl: string;    // resolved avatar or svg icon URL — passed as "image://url" in ECharts
  category: 'person' | 'org' | 'group';
  modelType: string;
  bkey: string;
  isCenter: boolean;
}

export interface ContextDiagramEdge {
  source: string;
  target: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

type ContextDiagramState = {
  startElement: string;   // "modelType.bkey" — original from section config
  config: ContextDiagramConfig;
  currentCenter: string;  // current center node; updated on navigation
};

const defaultConfig: ContextDiagramConfig = {
  startElement: '',
  showAvatar: true,
  showName: true,
  showMembers: false,
  showMemberships: false,
  showResponsibilities: true,
  showPersonalRels: false,
  showWorkRels: false,
  connectionNames: true,
  depth: 1,
};

const initialState: ContextDiagramState = {
  startElement: '',
  config: defaultConfig,
  currentCenter: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(element: string): { modelType: string; key: string } {
  const dot = element.indexOf('.');
  if (dot === -1) return { modelType: 'group', key: element };
  return { modelType: element.slice(0, dot), key: element.slice(dot + 1) };
}

type NodeRelations = {
  memberships: MembershipModel[];
  workrels: WorkrelModel[];
  personalRels: PersonalRelModel[];
  responsibilities: ResponsibilityModel[];
};

// keyed by "modelType.bkey"
type RelationsData = Record<string, NodeRelations>;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const ContextDiagramStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    workrelService: inject(WorkrelService),
    personalRelService: inject(PersonalRelService),
    avatarService: inject(AvatarService),
    modalController: inject(ModalController),
    actionSheetController: inject(ActionSheetController),
    groupEditModal: inject(GROUP_EDIT_MODAL),
    router: inject(Router),
    responsibilityService: inject(ResponsibilityService),
  })),
  withProps((store) => ({
    relationsResource: rxResource<RelationsData, { center: string; config: ContextDiagramConfig }>({
      params: () => ({ center: store.currentCenter(), config: store.config() }),
      stream: ({ params }) => {
        const { center, config } = params;
        if (!center) return of({} as RelationsData);

        return loadNodeRelations(center, config, store).pipe(
          switchMap(centerRelations => {
            const result: RelationsData = { [center]: centerRelations };
            if (config.depth < 2) return of(result);

            const level1Ids = collectConnectedIds(center, centerRelations, config);
            if (!level1Ids.length) return of(result);

            return combineLatest(
              level1Ids.map(id => loadNodeRelations(id, config, store).pipe(map(rels => ({ id, rels }))))
            ).pipe(
              map(entries => {
                const full: RelationsData = { ...result };
                for (const { id, rels } of entries) full[id] = rels;
                return full;
              }),
            );
          }),
        );
      },
    }),
  })),
  withComputed((state) => ({
    isLoading: computed(() => state.relationsResource.isLoading() || state.appStore.isLoading()),

    graphData: computed((): { nodes: ContextDiagramNode[]; edges: ContextDiagramEdge[] } => {
      const config = state.config();
      const center = state.currentCenter();
      if (!center) return { nodes: [], edges: [] };

      const { modelType, key } = parseElement(center);
      const avatarService = state.avatarService;

      const nodes: ContextDiagramNode[] = [];
      const edges: ContextDiagramEdge[] = [];

      // ---- center node ----
      const centerNode = buildCenterNode(center, modelType, key, state.appStore, avatarService);
      nodes.push(centerNode);

      const allRelations = state.relationsResource.value();
      if (!allRelations) return { nodes, edges };

      // level-1: center's relations; level-2 (if depth >= 2): each level-1 node's relations
      for (const [nodeId, rels] of Object.entries(allRelations)) {
        processRelations(nodeId, rels, config, nodes, edges, avatarService);
      }

      return { nodes, edges };
    }),
  })),
  withMethods((store) => ({
    setConfig(section: ContextDiagramSection): void {
      const config = section.properties as ContextDiagramConfig;
      patchState(store, {
        startElement: config.startElement,
        config,
        currentCenter: config.startElement,
      });
    },

    setCenter(nodeId: string): void {
      patchState(store, { currentCenter: nodeId });
    },

    updateConfig(config: ContextDiagramConfig): void {
      patchState(store, { config });
    },

    async editNode(nodeId: string): Promise<void> {
      const { modelType, key } = parseElement(nodeId);
      if (modelType === GroupModelName) {
        const group = store.appStore.getGroup(key);
        if (!group) return;
        const modal = await store.modalController.create({
          component: store.groupEditModal,
          cssClass: 'wide-modal',
          componentProps: {
            group,
            currentUser: store.appStore.currentUser(),
            tags: store.appStore.getTags(GroupModelName),
            tenantId: store.appStore.tenantId(),
            isNew: false,
            readOnly: false,
          },
        });
        await modal.present();
        await modal.onWillDismiss();
      } else if (modelType === OrgModelName) {
        const org = store.appStore.getOrg(key);
        if (!org) return;
        const modal = await store.modalController.create({
          component: OrgEditModalComponent,
          cssClass: 'wide-modal',
          componentProps: {
            org,
            currentUser: store.appStore.currentUser(),
            resource: store.appStore.defaultResource(),
            tags: store.appStore.getTags(OrgModelName),
            tenantId: store.appStore.tenantId(),
            types: store.appStore.getCategory('org_type'),
            readOnly: false,
          },
        });
        await modal.present();
        await modal.onWillDismiss();
      } else if (modelType === PersonModelName) {
        await navigateByUrl(store.router, `/person/${key}`, { readOnly: false });
      }
    },
  })),
);

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function nodeExists(nodes: ContextDiagramNode[], id: string): boolean {
  return nodes.some(n => n.id === id);
}

// ---------------------------------------------------------------------------
// Load relations for a single node
// ---------------------------------------------------------------------------

type Services = {
  membershipService: MembershipService;
  workrelService: WorkrelService;
  personalRelService: PersonalRelService;
  responsibilityService: ResponsibilityService;
};

function loadNodeRelations(
  nodeId: string,
  config: ContextDiagramConfig,
  services: Services,
) {
  const { modelType, key } = parseElement(nodeId);

  const memberships$ = (config.showMembers && (modelType === OrgModelName || modelType === GroupModelName))
    ? services.membershipService.listMembersOfOrg(key)
    : (config.showMemberships && modelType === PersonModelName)
      ? services.membershipService.listMembershipsOfMember(key, PersonModelName)
      : of<MembershipModel[]>([]);

  const workrels$ = (config.showWorkRels && modelType === PersonModelName)
    ? services.workrelService.listWorkrelsOfPerson(key)
    : of<WorkrelModel[]>([]);

  const personalRels$ = (config.showPersonalRels && modelType === PersonModelName)
    ? services.personalRelService.listPersonalRelsOfPerson(key)
    : of<PersonalRelModel[]>([]);

  const responsibilities$ = (config.showResponsibilities && (modelType === OrgModelName || modelType === GroupModelName || modelType === PersonModelName))
    ? services.responsibilityService.listForParent(nodeId)
    : of<ResponsibilityModel[]>([]);

  return combineLatest([memberships$, workrels$, personalRels$, responsibilities$]).pipe(
    map(([memberships, workrels, personalRels, responsibilities]): NodeRelations => ({ memberships, workrels, personalRels, responsibilities })),
  );
}

// ---------------------------------------------------------------------------
// Collect IDs of nodes directly connected to nodeId (for depth-2 loading)
// ---------------------------------------------------------------------------

function collectConnectedIds(nodeId: string, relations: NodeRelations, config: ContextDiagramConfig): string[] {
  const { modelType, key } = parseElement(nodeId);
  const ids = new Set<string>();

  if (config.showMembers && (modelType === OrgModelName || modelType === GroupModelName)) {
    for (const m of relations.memberships) ids.add(`${m.memberModelType}.${m.memberKey}`);
  }
  if (config.showMemberships && modelType === PersonModelName) {
    for (const m of relations.memberships) ids.add(`${m.orgModelType}.${m.orgKey}`);
  }
  if (config.showResponsibilities) {
    for (const r of relations.responsibilities) {
      if (r.responsibleAvatar) ids.add(`${r.responsibleAvatar.modelType}.${r.responsibleAvatar.key}`);
    }
  }
  if (config.showWorkRels && modelType === PersonModelName) {
    for (const w of relations.workrels) ids.add(`${OrgModelName}.${w.objectKey}`);
  }
  if (config.showPersonalRels && modelType === PersonModelName) {
    for (const r of relations.personalRels) {
      ids.add(r.subjectKey === key ? `${PersonModelName}.${r.objectKey}` : `${PersonModelName}.${r.subjectKey}`);
    }
  }

  ids.delete(nodeId);
  return [...ids];
}

// ---------------------------------------------------------------------------
// Build nodes + edges for a single node's relations
// ---------------------------------------------------------------------------

function processRelations(
  nodeId: string,
  relations: NodeRelations,
  config: ContextDiagramConfig,
  nodes: ContextDiagramNode[],
  edges: ContextDiagramEdge[],
  avatarService: AvatarService,
): void {
  const { modelType, key } = parseElement(nodeId);

  if (config.showMembers && (modelType === OrgModelName || modelType === GroupModelName)) {
    for (const m of relations.memberships) {
      const targetId = `${m.memberModelType}.${m.memberKey}`;
      if (!nodeExists(nodes, targetId)) {
        const name = m.memberModelType === PersonModelName
          ? getFullName(m.memberName1, m.memberName2)
          : (m.memberName2 || m.memberName1 || m.memberKey);
        const fallback = m.memberModelType === OrgModelName ? OrgModelName
          : m.memberModelType === GroupModelName ? GroupModelName : PersonModelName;
        nodes.push(buildNode(targetId, name, m.memberModelType as ContextDiagramNode['category'], avatarService, fallback, false));
      }
      edges.push({ source: nodeId, target: targetId, label: m.category || m.orgFunction || 'Mitglied' });
    }
  }

  if (config.showMemberships && modelType === PersonModelName) {
    for (const m of relations.memberships) {
      const targetId = `${m.orgModelType}.${m.orgKey}`;
      if (!nodeExists(nodes, targetId)) {
        nodes.push(buildNode(targetId, m.orgName || m.orgKey, m.orgModelType as ContextDiagramNode['category'], avatarService, m.orgModelType, false));
      }
      edges.push({ source: nodeId, target: targetId, label: m.category || 'Mitglied' });
    }
  }

  if (config.showWorkRels && modelType === PersonModelName) {
    for (const w of relations.workrels) {
      const targetId = `${OrgModelName}.${w.objectKey}`;
      if (!nodeExists(nodes, targetId)) {
        nodes.push(buildNode(targetId, w.objectName || w.objectKey, OrgModelName, avatarService, OrgModelName, false));
      }
      edges.push({ source: nodeId, target: targetId, label: w.label || w.name || '' });
    }
  }

  if (config.showPersonalRels && modelType === PersonModelName) {
    for (const r of relations.personalRels) {
      const isSubject = r.subjectKey === key;
      const otherId = isSubject ? `${PersonModelName}.${r.objectKey}` : `${PersonModelName}.${r.subjectKey}`;
      if (!nodeExists(nodes, otherId)) {
        const otherName = isSubject
          ? getFullName(r.objectFirstName, r.objectLastName)
          : getFullName(r.subjectFirstName, r.subjectLastName);
        nodes.push(buildNode(otherId, otherName, PersonModelName, avatarService, PersonModelName, false));
      }
      edges.push({ source: nodeId, target: otherId, label: r.label || r.type || '' });
    }
  }

  if (config.showResponsibilities) {
    for (const r of relations.responsibilities) {
      if (!r.responsibleAvatar) continue;
      const targetId = `${r.responsibleAvatar.modelType}.${r.responsibleAvatar.key}`;
      if (!nodeExists(nodes, targetId)) {
        const name = r.responsibleAvatar.modelType === PersonModelName
          ? getFullName(r.responsibleAvatar.name1, r.responsibleAvatar.name2)
          : (r.responsibleAvatar.name2 || r.responsibleAvatar.name1 || r.responsibleAvatar.key);
        nodes.push(buildNode(targetId, name, r.responsibleAvatar.modelType as ContextDiagramNode['category'], avatarService, r.responsibleAvatar.modelType, false));
      }
      edges.push({ source: nodeId, target: targetId, label: r.name });
    }
  }
}

function buildNode(
  id: string,
  name: string,
  category: ContextDiagramNode['category'],
  avatarService: AvatarService,
  fallbackIcon: string,
  isCenter: boolean,
  symbolSize = 40,
): ContextDiagramNode {
  return {
    id,
    name,
    symbolSize,
    symbolUrl: avatarService.getAvatarUrl(id, fallbackIcon),
    category,
    modelType: category,
    bkey: id.includes('.') ? id.split('.')[1] : id,
    isCenter,
  };
}

function buildCenterNode(
  center: string,
  modelType: string,
  key: string,
  appStore: InstanceType<typeof AppStore>,
  avatarService: AvatarService,
): ContextDiagramNode {
  let name = key;
  let fallback = modelType;

  if (modelType === PersonModelName) {
    const person = appStore.getPerson(key);
    if (person) name = getFullName(person.firstName, person.lastName);
  } else if (modelType === OrgModelName) {
    const org = appStore.getOrg(key);
    if (org) name = org.name;
  } else if (modelType === GroupModelName) {
    const group = appStore.getGroup(key);
    if (group) { name = group.name; fallback = group.icon || GroupModelName; }
  }

  return buildNode(center, name, modelType as ContextDiagramNode['category'], avatarService, fallback, true, 50);
}

