import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ActionSheetController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ContextDiagramConfig, ContextDiagramSection, GroupModelName, MembershipModel, OrgModelName, PersonalRelModel, PersonModelName, WorkrelModel } from '@bk2/shared-models';
import { getFullName } from '@bk2/shared-util-core';
import { AvatarService } from '@bk2/avatar-data-access';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { WorkrelService } from '@bk2/relationship-workrel-data-access';
import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';
import { GROUP_EDIT_MODAL } from '@bk2/subject-group-ui';
import { OrgEditModalComponent } from '@bk2/subject-org-feature';

// ---------------------------------------------------------------------------
// Graph node / edge types
// ---------------------------------------------------------------------------

export interface ContextDiagramNode {
  id: string;           // "modelType.bkey" or "ellipsis.{parentId}"
  name: string;
  symbolSize: number;
  symbolUrl: string;    // resolved avatar or svg icon URL — passed as "image://url" in ECharts
  category: 'person' | 'org' | 'group' | 'ellipsis';
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

type RelationsData = {
  memberships: MembershipModel[];
  workrels: WorkrelModel[];
  personalRels: PersonalRelModel[];
};

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
  })),
  withProps((store) => ({
    relationsResource: rxResource<RelationsData, { center: string; config: ContextDiagramConfig }>({
      params: () => ({ center: store.currentCenter(), config: store.config() }),
      stream: ({ params }) => {
        const { center, config } = params;
        if (!center) return of({ memberships: [], workrels: [], personalRels: [] });

        const { modelType, key } = parseElement(center);

        const memberships$: Observable<MembershipModel[]> = config.showMembers
          ? (modelType === 'org' || modelType === 'group'
            ? store.membershipService.listMembersOfOrg(key)
            : store.membershipService.listMembershipsOfMember(key, PersonModelName))
          : of([]);

        const workrels$: Observable<WorkrelModel[]> = (config.showResponsibilities && (modelType === 'org' || modelType === 'group'))
          ? store.workrelService.listWorkersOfOrg(key)
          : (config.showWorkRels && modelType === 'person')
            ? store.workrelService.listWorkrelsOfPerson(key)
            : of([]);

        const personalRels$: Observable<PersonalRelModel[]> = (config.showPersonalRels && modelType === 'person')
          ? store.personalRelService.listPersonalRelsOfPerson(key)
          : of([]);

        return combineLatest([memberships$, workrels$, personalRels$]).pipe(
          map(([memberships, workrels, personalRels]) => ({ memberships, workrels, personalRels })),
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
      const centerNode = buildCenterNode(center, modelType, key, config, state.appStore, avatarService);
      nodes.push(centerNode);

      const relations = state.relationsResource.value();
      if (!relations) return { nodes, edges };

      // ---- members ----
      if (config.showMembers) {
        for (const m of relations.memberships) {
          const nodeId = `${m.memberModelType}.${m.memberKey}`;
          if (!nodeExists(nodes, nodeId)) {
            const name = m.memberModelType === PersonModelName
              ? getFullName(m.memberName1, m.memberName2)
              : (m.memberName2 || m.memberName1 || m.memberKey);
            const fallback = m.memberModelType === OrgModelName ? OrgModelName
              : m.memberModelType === GroupModelName ? GroupModelName
              : PersonModelName;
            nodes.push(buildNode(nodeId, name, m.memberModelType as ContextDiagramNode['category'], avatarService, fallback, false));
          }
          edges.push({ source: center, target: nodeId, label: m.orgFunction || 'Mitglied' });
          if (config.depth >= 1) addEllipsis(nodes, nodeId, avatarService);
        }
      }

      // ---- responsibilities (workrels where center is org/group) ----
      if (config.showResponsibilities && (modelType === OrgModelName || modelType === GroupModelName)) {
        for (const w of relations.workrels) {
          const nodeId = `${w.subjectModelType}.${w.subjectKey}`;
          if (!nodeExists(nodes, nodeId)) {
            const name = w.subjectModelType === PersonModelName
              ? getFullName(w.subjectName2, w.subjectName1)
              : (w.subjectName1 || w.subjectKey);
            const fallback = w.subjectModelType === OrgModelName ? OrgModelName : PersonModelName;
            nodes.push(buildNode(nodeId, name, w.subjectModelType as ContextDiagramNode['category'], avatarService, fallback, false));
          }
          edges.push({ source: center, target: nodeId, label: w.label || w.name || '' });
          if (config.depth >= 1) addEllipsis(nodes, nodeId, avatarService);
        }
      }

      // ---- work rels (workrels where center is person → org) ----
      if (config.showWorkRels && modelType === PersonModelName) {
        for (const w of relations.workrels) {
          const nodeId = `${OrgModelName}.${w.objectKey}`;
          if (!nodeExists(nodes, nodeId)) {
            nodes.push(buildNode(nodeId, w.objectName || w.objectKey, OrgModelName, avatarService, OrgModelName, false));
          }
          edges.push({ source: center, target: nodeId, label: w.label || w.name || '' });
          if (config.depth >= 1) addEllipsis(nodes, nodeId, avatarService);
        }
      }

      // ---- personal rels ----
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
          edges.push({ source: center, target: otherId, label: r.label || r.type || '' });
          if (config.depth >= 1) addEllipsis(nodes, otherId, avatarService);
        }
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
      }
      // person editing is done via PersonEditPage (no modal available)
    },
  })),
);

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function nodeExists(nodes: ContextDiagramNode[], id: string): boolean {
  return nodes.some(n => n.id === id);
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
  config: ContextDiagramConfig,
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

function addEllipsis(nodes: ContextDiagramNode[], parentId: string, avatarService: AvatarService): void {
  const ellipsisId = `ellipsis.${parentId}`;
  if (!nodeExists(nodes, ellipsisId)) {
    // symbolUrl for ellipsis will be resolved in the component via getSvgIconUrl
    nodes.push({
      id: ellipsisId,
      name: '',
      symbolSize: 20,
      symbolUrl: '',   // placeholder — component fills this in via getSvgIconUrl
      category: 'ellipsis',
      modelType: 'ellipsis',
      bkey: parentId,
      isCenter: false,
    });
  }
}
