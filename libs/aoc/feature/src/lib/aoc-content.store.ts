import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, first, forkJoin, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AccordionSection, BkModel, LogInfo, MembershipCollection, MembershipModel, MenuItemModel, OrgCollection, OrgModel, PageCollection, PageModel, PeopleSection, PersonCollection, PersonModel, SectionModel, UserModel } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { getSystemQuery, replaceSubstring, safeStructuredClone } from '@bk2/shared-util-core';

import { MenuService } from '@bk2/cms-menu-data-access';
import { MenuItemModalComponent } from '@bk2/cms-menu-feature';
import { SectionService } from '@bk2/cms-section-data-access';
import { SectionEditModalComponent } from '@bk2/cms-section-feature';

export type AocContentState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
  orphanedSections: SectionModel[];
  orphanedMenus: MenuItemModel[];
};

export const initialState: AocContentState = {
  modelType: undefined,
  log: [],
  logTitle: '',
  orphanedSections: [],
  orphanedMenus: [],
};

export const AocContentStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    sectionService: inject(SectionService),
    menuService: inject(MenuService),
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
        console.log('AocContentStore.findMissingSections: not yet implemented');
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
        console.log('AocContentStore.findMissingMenus: not yet implemented');
      },

      checkLinks(): void {
        console.log('AocContentStore.checkLinks: not yet implemented');
      },
    };
  })
);
