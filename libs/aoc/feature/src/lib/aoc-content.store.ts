import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, first, forkJoin, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AccordionSection, BkModel, LogInfo, MembershipCollection, MembershipModel, MenuItemModel, OrgCollection, OrgModel, PageCollection, PageModel, PeopleSection, PersonCollection, PersonModel, SectionModel, UserModel } from '@bk2/shared-models';
import { confirm, navigateByUrl } from '@bk2/shared-util-angular';
import { getSystemQuery, replaceSubstring, safeStructuredClone } from '@bk2/shared-util-core';

import { Router } from '@angular/router';
import { MenuService } from '@bk2/cms-menu-data-access';
import { MenuItemModalComponent } from '@bk2/cms-menu-feature';
import { PageService } from '@bk2/cms-page-data-access';
import { SectionService } from '@bk2/cms-section-data-access';
import { SectionEditModalComponent } from '@bk2/cms-section-feature';

export type MissingMenuRef = {
  parent: MenuItemModel;   // menu item that contains the broken reference
  missingKey: string;      // the child name that does not exist
};

export type MissingSectionRef = {
  page: PageModel;         // page that references the missing section
  rawKey: string;          // as stored in page.sections (may contain @TID@)
  resolvedKey: string;     // fully resolved bkey
};

export type AocContentState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
  orphanedSections: SectionModel[];
  orphanedMenus: MenuItemModel[];
  missingMenuRefs: MissingMenuRef[];
  missingSectionRefs: MissingSectionRef[];
};

export const initialState: AocContentState = {
  modelType: undefined,
  log: [],
  logTitle: '',
  orphanedSections: [],
  orphanedMenus: [],
  missingMenuRefs: [],
  missingSectionRefs: [],
};

export const AocContentStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    router: inject(Router),
    firestoreService: inject(FirestoreService),
    sectionService: inject(SectionService),
    menuService: inject(MenuService),
    pageService: inject(PageService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
  })),
  withProps(store => ({
    dataResource: rxResource({
      params: () => ({
        modelType: store.modelType(),
      }),
      stream: ({ params }): Observable<BkModel[] | undefined> => {
        switch (params.modelType) {
          case 'person':
            return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
          case 'org':
            return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.env.tenantId), 'name', 'asc');
          case 'membership':
            return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.env.tenantId), 'memberName2', 'asc');
          default:
            return of(undefined);
        }
      },
    }),
  })),

  withComputed(state => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.dataResource.isLoading()),
      data: computed(() => state.dataResource.value() ?? []),
    };
  }),

  withMethods(store => {
    return {
      /******************************** setters (filter) ******************************************* */
      setModelType(modelType: string | undefined): void {
        patchState(store, { modelType, log: [], logTitle: '' });
      },

      /******************************** setters (filter) ******************************************* */
      findOrphanedSections(): void {
        const tenantId = store.appStore.env.tenantId;

        const sections$ = store.sectionService.list().pipe(first());
        const pages$ = store.firestoreService
          .searchData<PageModel>(PageCollection, getSystemQuery(tenantId), 'name', 'asc')
          .pipe(first());

        forkJoin([sections$, pages$]).subscribe(([sections, pages]) => {
          // Collect every section key referenced by at least one page
          const referencedKeys = new Set<string>();
          for (const page of pages) {
            for (const key of (page.sections ?? [])) {
              const id = replaceSubstring(key, '@TID@', tenantId);
              referencedKeys.add(id);
            }
          }

          // Also collect sectionIds from AccordionConfig items and AvatarConfig.linkedSection
          for (const section of sections) {
            if (section.type === 'accordion') {
              const acc = section as AccordionSection;
              if (acc.properties.items) {
                for (const item of acc.properties.items) {
                  if (item.key) {
                    const id = replaceSubstring(item.key, '@TID@', tenantId);
                    referencedKeys.add(id);
                  }
                } 
              }
            }

            // PeopleConfig: properties.avatar.linkedSection
            if (section.type === 'people') {
              const ps = section as PeopleSection;
              const key = ps.properties.avatar.linkedSection
              if (key) {
                const id = replaceSubstring(key, '@TID@', tenantId);
                referencedKeys.add(id);
              }
            }
          }
          const orphaned = sections.filter(s => s.bkey && !referencedKeys.has(s.bkey));
          patchState(store, { orphanedSections: orphaned });
        });
      },

      async editSection(section: SectionModel): Promise<void> {
        const currentUser: UserModel | undefined = store.currentUser();
        const tags = store.appStore.getTags('section_default');
        const roles = store.appStore.getCategory('roles');
        const states = store.appStore.getCategory('content_state');
        const modal = await store.modalController.create({
          component: SectionEditModalComponent,
          cssClass: 'full-modal',
          componentProps: { 
            section, 
            currentUser, 
            tags,
            roles,
            states,
            readOnly: false
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          await store.sectionService.update(data as SectionModel, currentUser);
          // Refresh orphaned list
          this.findOrphanedSections();
        }
      },

      async removeSection(section: SectionModel): Promise<void> {
        const ok = await confirm(store.alertController, '@content.section.operation.delete.confirm', true);
        if (ok) {
          await store.sectionService.delete(section, store.currentUser());
          patchState(store, {
            orphanedSections: store.orphanedSections().filter(s => s.bkey !== section.bkey),
          });
        }
      },

      findMissingSections(): void {
        const tenantId = store.appStore.env.tenantId;
        const sections$ = store.sectionService.list().pipe(first());
        const pages$ = store.firestoreService
          .searchData<PageModel>(PageCollection, getSystemQuery(tenantId), 'name', 'asc')
          .pipe(first());

        forkJoin([sections$, pages$]).subscribe(([sections, pages]) => {
          const existingKeys = new Set(sections.map(s => s.bkey).filter(Boolean));
          const refs: MissingSectionRef[] = [];
          for (const page of pages) {
            for (const rawKey of (page.sections ?? [])) {
              const resolvedKey = replaceSubstring(rawKey, '@TID@', tenantId);
              if (!existingKeys.has(resolvedKey)) {
                refs.push({ page, rawKey, resolvedKey });
              }
            }
          }
          patchState(store, { missingSectionRefs: refs });
        });
      },

      findOrphanedMenus(): void {
        store.menuService.list().pipe(first()).subscribe(menuItems => {
          // Collect every menu item key referenced as a sub-item by any parent
          const referencedKeys = new Set<string>();
          for (const item of menuItems) {
            switch(item.action) {
              case 'main':
              case 'context': referencedKeys.add(item.name);
              case 'sub': 
                for (const key of (item.menuItems ?? [])) {
                  referencedKeys.add(key);
                }
            }
          }
          const orphaned = menuItems.filter(m => m.name && !referencedKeys.has(m.name));
          patchState(store, { orphanedMenus: orphaned });
        });
      },

      async editMenu(menuItem: MenuItemModel): Promise<void> {
        const _menuItem = safeStructuredClone(menuItem);
        const modal = await store.modalController.create({
          component: MenuItemModalComponent,
          componentProps: {
            menuItem: _menuItem,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags('menuitem'),
            roles: store.appStore.getCategory('roles'),
            types: store.appStore.getCategory('menu_action'),
            readOnly: false,
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          await store.menuService.update(data as MenuItemModel, store.currentUser());
          this.findOrphanedMenus();
        }
      },

      async removeMenu(menuItem: MenuItemModel): Promise<void> {
        const ok = await confirm(store.alertController, '@content.menuItem.operation.delete.conf', true);
        if (ok) {
          await store.menuService.delete(menuItem, store.currentUser());
          patchState(store, {
            orphanedMenus: store.orphanedMenus().filter(m => m.bkey !== menuItem.bkey),
          });
        }
      },

      findMissingMenus(): void {
        store.menuService.list().pipe(first()).subscribe(menuItems => {
          const existingNames = new Set(menuItems.map(m => m.name).filter(Boolean));
          const refs: MissingMenuRef[] = [];
          for (const item of menuItems) {
            for (const childKey of (item.menuItems ?? [])) {
              if (!existingNames.has(childKey)) {
                refs.push({ parent: item, missingKey: childKey });
              }
            }
          }
          patchState(store, { missingMenuRefs: refs });
        });
      },

      async addMissingMenu(ref: MissingMenuRef): Promise<void> {
        const newItem = { name: ref.missingKey, action: 'sub', menuItems: [], tenants: [store.appStore.env.tenantId] } as unknown as MenuItemModel;
        await store.menuService.create(newItem, store.currentUser());
        this.findMissingMenus();
      },

      async removeMissingMenuRef(ref: MissingMenuRef): Promise<void> {
        const ok = await confirm(store.alertController, '@content.menuItem.operation.delete.conf', true);
        if (!ok) return;
        const updated = { ...ref.parent, menuItems: (ref.parent.menuItems ?? []).filter(k => k !== ref.missingKey) };
        await store.menuService.update(updated as MenuItemModel, store.currentUser());
        patchState(store, { missingMenuRefs: store.missingMenuRefs().filter(r => !(r.parent.bkey === ref.parent.bkey && r.missingKey === ref.missingKey)) });
      },

      async createMissingSection(ref: MissingSectionRef): Promise<void> {
        const currentUser = store.currentUser();
        const tags = store.appStore.getTags('section_default');
        const roles = store.appStore.getCategory('roles');
        const states = store.appStore.getCategory('content_state');
        const newSection = { bkey: '', type: 'article', state: 'active', name: ref.resolvedKey, title: '', tenants: [store.appStore.env.tenantId] } as unknown as SectionModel;
        const modal = await store.modalController.create({
          component: SectionEditModalComponent,
          cssClass: 'full-modal',
          componentProps: { section: newSection, currentUser, tags, roles, states, readOnly: false, isNew: true },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role !== 'confirm' || !data) return;
        const newKey = await store.sectionService.create(data as SectionModel, currentUser);
        if (newKey) {
          // Update the page: replace the broken raw key with the newly created section key
          const updatedSections = (ref.page.sections ?? []).map(k => k === ref.rawKey ? newKey : k);
          await store.pageService.update({ ...ref.page, sections: updatedSections }, currentUser);
        }
        this.findMissingSections();
      },

      async removeSectionRefFromPage(ref: MissingSectionRef): Promise<void> {
        const ok = await confirm(store.alertController, '@content.section.operation.delete.confirm', true);
        if (!ok) return;
        const updatedSections = (ref.page.sections ?? []).filter(k => k !== ref.rawKey);
        await store.pageService.update({ ...ref.page, sections: updatedSections }, store.currentUser());
        patchState(store, { missingSectionRefs: store.missingSectionRefs().filter(r => !(r.page.bkey === ref.page.bkey && r.rawKey === ref.rawKey)) });
      },

      clearOrphanedSections(): void {
        patchState(store, { orphanedSections: [] });
      },

      clearOrphanedMenus(): void {
        patchState(store, { orphanedMenus: [] });
      },

      clearMissingSections(): void {
        patchState(store, { missingSectionRefs: [] });
      },

      clearMissingMenus(): void {
        patchState(store, { missingMenuRefs: [] });
      },

      async editPage(page: PageModel): Promise<void> {
        await navigateByUrl(store.router, `/private/${page.bkey}/c-contentpage`, { readOnly: false });
      },

      checkLinks(): void {
        console.log('AocContentStore.checkLinks: not yet implemented');
      },
    };
  })
);
