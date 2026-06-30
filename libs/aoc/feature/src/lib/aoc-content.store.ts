import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, firstValueFrom, forkJoin, from, of } from 'rxjs';
import { Router } from '@angular/router';
import { StorageReference, deleteObject, getDownloadURL, getMetadata, listAll, ref } from 'firebase/storage';

import { STORAGE } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AccordionSection, ArticleSection, BkModel, DocumentCollection, DocumentModel, ImageConfig, ImageType, LogInfo, MembershipCollection, MembershipModel, MenuItemModel, OrgCollection, OrgModel, PageCollection, PageModel, PeopleSection, PersonCollection, PersonModel, SectionModel, SliderSection, UserModel } from '@bk2/shared-models';
import { confirm, downloadToBrowser, navigateByUrl } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, getFullName, getSystemQuery, getTodayStr, replaceSubstring, safeStructuredClone } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { DocumentService } from '@bk2/document-data-access';
import { extractDateFromFileName, extractTagsFromStoragePath, extractTitleFromFileName, getDocumentIndex } from '@bk2/document-util';
import { MenuService } from '@bk2/cms-menu-data-access';
import { MenuModal } from '@bk2/cms-menu-feature';
import { PageService } from '@bk2/cms-page-data-access';
import { SectionService } from '@bk2/cms-section-data-access';
import { SectionEditModal } from '@bk2/cms-section-feature';

import { AOC_I18N_KEYS } from '@bk2/aoc-util';
import { SectionImageDetailModal } from './section-image-detail.modal';

export type MissingMenuRef = {
  parent: MenuItemModel;   // menu item that contains the broken reference
  missingKey: string;      // the child name that does not exist
};

export type MissingSectionRef = {
  page: PageModel;         // page that references the missing section
  rawKey: string;          // as stored in page.sections (may contain @TID@)
  resolvedKey: string;     // fully resolved bkey
};

/** A section image file that exists in Firebase Storage but has no docs DB entry. */
export type SectionImageRef = {
  section: SectionModel;   // the section the image was uploaded for
  fullPath: string;        // storage path, e.g. tenant/<tid>/section/<key>/file.jpg
  downloadUrl: string;
  size: number;
  contentType: string;
  timeCreated: string;     // ISO 8601 from storage metadata
  updated: string;         // ISO 8601 from storage metadata
  md5Hash: string;         // base64-encoded MD5 from storage metadata
};

export type AocContentState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
  orphanedSections: SectionModel[];
  orphanedMenus: MenuItemModel[];
  missingMenuRefs: MissingMenuRef[];
  missingSectionRefs: MissingSectionRef[];
  sectionImagesMissingDoc: SectionImageRef[];
};

export const initialState: AocContentState = {
  modelType: undefined,
  log: [],
  logTitle: '',
  orphanedSections: [],
  orphanedMenus: [],
  missingMenuRefs: [],
  missingSectionRefs: [],
  sectionImagesMissingDoc: [],
};

/** List all (non-recursive) file refs directly under a storage directory; [] if the dir does not exist. */
async function listStorageImages(storage: import('firebase/storage').FirebaseStorage, dir: string): Promise<StorageReference[]> {
  try {
    return (await listAll(ref(storage, dir))).items;
  } catch {
    return [];
  }
}

/** Convert an ISO 8601 date string from Firebase Storage metadata to the app's store date format. */
function isoToStoreDate(iso: string): string {
  return convertDateFormatToString(iso.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
}

export const AocContentStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    router: inject(Router),
    storage: inject(STORAGE),
    firestoreService: inject(FirestoreService),
    sectionService: inject(SectionService),
    documentService: inject(DocumentService),
    menuService: inject(MenuService),
    pageService: inject(PageService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    i18nService: inject(I18nService)
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),

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

        const sections$ = from(store.sectionService.listOnce());
        const pages$ = from(store.firestoreService
          .getDataOnce<PageModel>(PageCollection, getSystemQuery(tenantId), 'name', 'asc'));

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
          component: SectionEditModal,
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
        const ok = await confirm(store.alertController, store.i18n.content_section_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (ok) {
          await store.sectionService.delete(section, store.currentUser());
          patchState(store, {
            orphanedSections: store.orphanedSections().filter(s => s.bkey !== section.bkey),
          });
        }
      },

      findMissingSections(): void {
        const tenantId = store.appStore.env.tenantId;
        const sections$ = from(store.sectionService.listOnce());
        const pages$ = from(store.firestoreService
          .getDataOnce<PageModel>(PageCollection, getSystemQuery(tenantId), 'name', 'asc'));

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
        from(store.menuService.listOnce()).subscribe(menuItems => {
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
          component: MenuModal,
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
        const ok = await confirm(store.alertController, store.i18n.content_menu_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (ok) {
          await store.menuService.delete(menuItem, store.currentUser());
          patchState(store, {
            orphanedMenus: store.orphanedMenus().filter(m => m.bkey !== menuItem.bkey),
          });
        }
      },

      findMissingMenus(): void {
        from(store.menuService.listOnce()).subscribe(menuItems => {
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
        const ok = await confirm(store.alertController, store.i18n.content_menu_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
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
          component: SectionEditModal,
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
        const ok = await confirm(store.alertController, store.i18n.content_section_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
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

      /******************************** section images without a docs entry ******************************************* */
      // For each section, list its uploaded images in storage (tenant/<tid>/section/<key>)
      // and report those for which no docs Firestore entry exists.
      async findSectionImagesWithMissingDoc(): Promise<void> {
        const tenantId = store.appStore.env.tenantId;
        const [allDocs, sections] = await Promise.all([
          store.documentService.listOnce(),
          store.sectionService.listOnce(),
        ]);
        const existingPaths = new Set(allDocs.map(d => d.fullPath).filter(Boolean));

        const refs: SectionImageRef[] = [];
        await Promise.all(sections.map(async (section) => {
          if (!section.bkey) return;
          const dir = `tenant/${tenantId}/section/${section.bkey}`;
          const items = await listStorageImages(store.storage, dir);
          await Promise.all(items
            .filter(item => !existingPaths.has(item.fullPath))
            .map(async (item) => {
              try {
                const [metadata, downloadUrl] = await Promise.all([getMetadata(item), getDownloadURL(item)]);
                if (!(metadata.contentType ?? '').startsWith('image/')) return; // images only
                refs.push({
                  section,
                  fullPath: item.fullPath,
                  downloadUrl,
                  size: metadata.size,
                  contentType: metadata.contentType ?? '',
                  timeCreated: metadata.timeCreated,
                  updated: metadata.updated,
                  md5Hash: metadata.md5Hash ?? '',
                });
              } catch {
                // skip inaccessible files
              }
            }));
        }));
        patchState(store, { sectionImagesMissingDoc: refs });
      },

      clearSectionImagesMissingDoc(): void {
        patchState(store, { sectionImagesMissingDoc: [] });
      },

      async showImageDetail(image: SectionImageRef): Promise<void> {
        const modal = await store.modalController.create({
          component: SectionImageDetailModal,
          componentProps: { image },
        });
        await modal.present();
        await modal.onWillDismiss();
      },

      async downloadImage(image: SectionImageRef): Promise<void> {
        await downloadToBrowser(image.downloadUrl);
      },

      async deleteImage(image: SectionImageRef): Promise<void> {
        const ok = await confirm(store.alertController, store.i18n.content_image_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (!ok) return;
        await deleteObject(ref(store.storage, image.fullPath));
        patchState(store, { sectionImagesMissingDoc: store.sectionImagesMissingDoc().filter(r => r.fullPath !== image.fullPath) });
      },

      async createDocumentForImage(image: SectionImageRef): Promise<void> {
        const currentUser = store.currentUser();
        const tenantId = store.appStore.env.tenantId;

        const rawFileName = image.fullPath.split('/').pop() ?? '';
        const fileNameDate = extractDateFromFileName(rawFileName);
        const creationDate = fileNameDate ?? (image.timeCreated ? isoToStoreDate(image.timeCreated) : getTodayStr());
        const updateDate = fileNameDate ?? (image.updated ? isoToStoreDate(image.updated) : creationDate);
        const title = extractTitleFromFileName(rawFileName) || rawFileName;
        const tags = extractTagsFromStoragePath(image.fullPath);

        const document = new DocumentModel(tenantId);
        document.title = title;
        document.altText = title;
        document.fullPath = image.fullPath;
        document.url = image.downloadUrl;
        document.mimeType = image.contentType;
        document.size = image.size;
        document.source = 'storage';
        document.hash = image.md5Hash;
        document.dateOfDocCreation = creationDate;
        document.dateOfDocLastUpdate = updateDate;
        document.version = creationDate;
        document.folderKeys = [];
        document.tags = tags;
        document.authorKey = currentUser?.personKey ?? '';
        document.authorName = getFullName(currentUser?.firstName, currentUser?.lastName);
        document.index = getDocumentIndex(document);
        await store.firestoreService.createModel<DocumentModel>(
          DocumentCollection, document, store.i18n.content_image_create_conf(), store.i18n.content_image_create_error(), currentUser
        );

        // Creating the docs record alone does NOT make the image visible: the section
        // detail list and slider render section.properties.images. So also link the
        // image into its section (article/slider) unless it is already referenced.
        await this.linkImageToSection(image, title);

        patchState(store, { sectionImagesMissingDoc: store.sectionImagesMissingDoc().filter(r => r.fullPath !== image.fullPath) });
      },

      // Append an ImageConfig (pointing at the storage file) to the section's images
      // array so it shows up in the section detail list and the rendered slider.
      // Only article and slider sections expose a properties.images list.
      async linkImageToSection(image: SectionImageRef, label: string): Promise<void> {
        const key = image.section.bkey;
        if (!key) return;
        const fresh = await firstValueFrom(store.sectionService.read(key));
        if (!fresh || (fresh.type !== 'article' && fresh.type !== 'slider')) return;

        const section = fresh as ArticleSection | SliderSection;
        const images = section.properties.images ?? [];
        if (images.some(img => img.url === image.fullPath)) return; // already linked

        const newImage: ImageConfig = {
          label,
          type: ImageType.Image,
          url: image.fullPath,
          actionUrl: '',
          altText: label,
          overlay: '',
        };
        const updated = { ...section, properties: { ...section.properties, images: [...images, newImage] } } as SectionModel;
        await store.sectionService.update(updated, store.currentUser());
      },

      checkLinks(): void {
        console.log('AocContentStore.checkLinks: not yet implemented');
      },
    };
  })
);
