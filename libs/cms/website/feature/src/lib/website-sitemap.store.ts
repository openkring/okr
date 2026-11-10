import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PageModel, SectionModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';
import { hasRole, isOwnedBy } from '@okr/shared-util-core';
import { confirm, copyToClipboardDeferred, okrPrompt, resourceParams, showToast } from '@okr/shared-util-angular';

import { PageService } from '@okr/cms-page-data-access';
import { PageStore } from '@okr/cms-page-feature';
import { SectionService } from '@okr/cms-section-data-access';
import { WebsiteService } from '@okr/cms-website-data-access';
import { WebsiteNodeEditModal } from '@okr/cms-website-ui';
import {
  archiveNode, findNode, findParentId, insertNode, moveNode, moveTargets, newNodeId, pageKeysInTree,
  reorderSiblings, siteWarnings, slugify, uniqueSlug, updateNode, WEBSITE_I18N_KEYS, WebsiteI18n,
  WebsiteNodeFormModel, WebsiteWarningCode, websiteUrl,
} from '@okr/cms-website-util';

import { WebsiteMoveModal } from './website-move.modal';
import { WebsitePagePickerModal } from './website-page-picker.modal';

/** All nodes of a tree, depth first. */
function flatten(nodes: WebsiteNode[], out: WebsiteNode[] = []): WebsiteNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children) flatten(n.children, out);
  }
  return out;
}

const MOVE_ERRORS: Record<string, keyof WebsiteI18n> = {
  'website.move.intoSelf': 'move_into_self',
  'website.move.notMenu': 'move_not_menu',
};

/*
 * STALE SNAPSHOT RULE (plan 1.153, Review Focus 2): two admins may edit the tree at the same time
 * and the last write wins. Every method therefore takes the tree from `latest()` AFTER its last
 * await (modal, alert, page write) and calls `saveTree` once with the tree it just computed —
 * never a snapshot captured before the await.
 */
export const _WebsiteSitemapStore = signalStore(
  withState({ siteId: '' }),
  withProps(() => ({
    appStore: inject(AppStore),
    websiteService: inject(WebsiteService),
    pageService: inject(PageService),
    pageStore: inject(PageStore),
    sectionService: inject(SectionService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(WEBSITE_I18N_KEYS) as WebsiteI18n,
  })),
  withComputed((store) => ({
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
    imgixBaseUrl: computed(() => store.appStore.services.imgixBaseUrl()),
  })),
  withProps((store) => ({
    websiteResource: rxResource({
      params: resourceParams(() => ({ siteId: store.siteId() })),
      stream: ({ params }) => store.websiteService.read(params.siteId).pipe(catchError(() => of(undefined))),
    }),
    pagesResource: rxResource({
      params: resourceParams(() => ({ userKey: store.currentUser()?.okey ?? '' })),
      stream: () => store.pageService.list().pipe(catchError(() => of([] as PageModel[]))),
    }),
  })),
  withComputed((store) => {
    const website = computed(() => store.websiteResource.value());
    const nav = computed(() => website()?.nav ?? []);
    const pagesByKey = computed(() => new Map((store.pagesResource.value() ?? []).map((p) => [p.okey, p])));
    return {
      website,
      nav,
      pagesByKey,
      isLoading: computed(() => store.websiteResource.isLoading()),
      siteName: computed(() => website()?.name ?? ''),
      nodeCount: computed(() => flatten(nav()).filter((n) => !n.isArchived).length),
      canEdit: computed(() => hasRole('contentAdmin', store.currentUser())),
      warnings: computed(() => {
        const site = website();
        return site ? siteWarnings(site, pagesByKey()) : [];
      }),
      /** section keys of the pages in the tree, for the «n Sektionen im Entwurf» hint */
      treeSectionKeys: computed(() => {
        const keys = pageKeysInTree(nav()).flatMap((k) => pagesByKey().get(k)?.sections ?? []);
        return [...new Set(keys)].sort();
      }),
    };
  }),
  withComputed((store) => ({
    warningsByNode: computed(() => {
      const map = new Map<string, WebsiteWarningCode[]>();
      for (const w of store.warnings()) {
        if (w.nodeId) map.set(w.nodeId, [...(map.get(w.nodeId) ?? []), w.code]);
      }
      return map;
    }),
    siteLevelWarnings: computed(() => store.warnings().filter((w) => !w.nodeId).map((w) => w.code)),
  })),
  withProps((store) => ({
    sectionsResource: rxResource({
      params: resourceParams(() => ({ keys: store.treeSectionKeys() })),
      stream: ({ params }) => store.sectionService.searchByKeys(params.keys).pipe(catchError(() => of([] as SectionModel[]))),
    }),
  })),
  withComputed((store) => ({
    /** pageKey → number of its sections that are not published */
    draftsByPage: computed(() => {
      const sections = new Map((store.sectionsResource.value() ?? []).map((s) => [s.okey, s]));
      const map = new Map<string, number>();
      for (const [key, page] of store.pagesByKey()) {
        const drafts = (page.sections ?? []).filter((k) => { const s = sections.get(k); return !!s && s.state !== 'published'; }).length;
        if (drafts > 0) map.set(key, drafts);
      }
      return map;
    }),
  })),
  withMethods((store) => {
    /** The current site, read at call time — call it after the last await of a method. */
    const latest = (): WebsiteModel | undefined => store.websiteResource.value();
    const save = async (site: WebsiteModel, nav: WebsiteNode[]): Promise<void> =>
      store.websiteService.saveTree(site, { nav }, store.currentUser());
    const toast = async (message: string): Promise<void> => showToast(store.toastController, message);

    const openNodeModal = async (node: WebsiteNode, isNew: boolean): Promise<WebsiteNodeFormModel | undefined> => {
      const modal = await store.modalController.create({ component: WebsiteNodeEditModal, componentProps: { node, isNew } });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<WebsiteNodeFormModel>();
      return role === 'confirm' ? data : undefined;
    };

    /** Inserts `node` below `parentId` (null = top level) into the latest tree, if that parent still exists. */
    const insert = async (parentId: string | null, node: WebsiteNode): Promise<void> => {
      const site = latest();
      if (!site) return;
      if (parentId !== null && findNode(site.nav, parentId)?.type !== 'menu') return;
      await save(site, insertNode(site.nav, parentId, node));
    };

    const slugFor = (site: WebsiteModel, name: string): string =>
      uniqueSlug([...site.nav, ...site.footer], slugify(name) || 'seite');

    const addNewPage = async (parentId: string | null): Promise<void> => {
      const i18n = store.i18n;
      const name = (await okrPrompt(store.alertController, i18n.add_page_name(), i18n.add_page_name_ph(), i18n.ok(), i18n.cancel()))?.trim();
      if (!name) return;
      const page = new PageModel(store.tenantId());
      page.name = name;
      page.type = 'content';
      page.isPrivate = false;
      const pageKey = await store.pageService.create(page, store.currentUser());
      if (!pageKey) return;
      const site = latest();
      if (!site) return;
      await insert(parentId, { id: newNodeId(), type: 'page', label: name, pageKey, slug: slugFor(site, name) });
    };

    const addExistingPage = async (parentId: string | null): Promise<void> => {
      const i18n = store.i18n;
      const inTree = new Set(pageKeysInTree([...store.nav(), ...(store.website()?.footer ?? [])]));
      const tenantId = store.tenantId();
      // a private page shared with other tenants cannot be made public from here (PageService.setPrivate refuses)
      const pages = (store.pagesResource.value() ?? [])
        .filter((p) => !inTree.has(p.okey) && (isOwnedBy(p, tenantId) || !p.isPrivate));
      const modal = await store.modalController.create({ component: WebsitePagePickerModal, componentProps: { pages } });
      await modal.present();
      const { data: pageKey, role } = await modal.onWillDismiss<string>();
      if (role !== 'confirm' || !pageKey) return;
      const page = store.pagesByKey().get(pageKey);
      if (!page) return;
      if (!await confirm(store.alertController, i18n.add_page_public_confirm(), i18n.ok(), i18n.cancel(), true)) return;
      if (page.isPrivate && !await store.pageService.setPrivate(page, false)) return;
      const site = latest();
      if (!site) return;
      if (pageKeysInTree([...site.nav, ...site.footer]).includes(pageKey)) {
        await toast(i18n.page_in_tree());
        return;
      }
      await insert(parentId, { id: newNodeId(), type: 'page', label: page.name, pageKey, slug: slugFor(site, page.name) });
    };

    return {
      setSiteId(siteId: string): void {
        patchState(store, { siteId });
      },

      /** Creates `websites/{siteId}` with the app name and an empty tree. */
      async createSite(): Promise<void> {
        const siteId = store.siteId();
        if (!siteId || latest()) return;
        const site = new WebsiteModel(siteId);
        site.okey = siteId;
        site.name = store.appStore.appConfig().appName;
        await store.websiteService.create(site, store.currentUser());
      },

      async addMenu(parentId: string | null): Promise<void> {
        const data = await openNodeModal({ id: '', type: 'menu', label: '' }, true);
        if (!data) return;
        await insert(parentId, { id: newNodeId(), type: 'menu', label: data.label, children: [] });
      },

      async addLink(parentId: string | null): Promise<void> {
        const data = await openNodeModal({ id: '', type: 'link', label: '', url: '', style: 'default' }, true);
        if (!data) return;
        await insert(parentId, { id: newNodeId(), type: 'link', label: data.label, url: data.url, style: data.style });
      },

      /** Asks «Neue Seite» or «Bestehende Seite», then adds a page node. */
      async addPage(parentId: string | null): Promise<void> {
        const i18n = store.i18n;
        const alert = await store.alertController.create({
          header: i18n.add_page_title(),
          buttons: [
            { text: i18n.add_page_new(), role: 'new' },
            { text: i18n.add_page_existing(), role: 'existing' },
            { text: i18n.cancel(), role: 'cancel' },
          ],
        });
        await alert.present();
        const { role } = await alert.onWillDismiss();
        if (role === 'new') await addNewPage(parentId);
        else if (role === 'existing') await addExistingPage(parentId);
      },

      async edit(node: WebsiteNode): Promise<void> {
        const data = await openNodeModal(node, false);
        if (!data) return;
        const site = latest();
        const current = site ? findNode(site.nav, node.id) : undefined;
        if (!site || !current) return;
        const patch: Partial<WebsiteNode> = { label: data.label };
        if (current.type === 'page') {
          const taken = flatten([...site.nav, ...site.footer]).some((n) => n.id !== node.id && n.slug === data.slug);
          if (taken) {
            await toast(store.i18n.slug_taken());
            return;
          }
          patch.slug = data.slug;
        }
        if (current.type === 'link') {
          patch.url = data.url;
          patch.style = data.style;
        }
        await save(site, updateNode(site.nav, node.id, patch));
      },

      async move(node: WebsiteNode): Promise<void> {
        const shown = store.nav();
        const modal = await store.modalController.create({
          component: WebsiteMoveModal,
          componentProps: { targets: moveTargets(shown, node.id), currentParentId: findParentId(shown, node.id) },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ parentId: string | null }>();
        if (role !== 'confirm' || !data) return;
        const site = latest();
        if (!site || !findNode(site.nav, node.id) || findParentId(site.nav, node.id) === data.parentId) return;
        const siblings = data.parentId === null ? site.nav : (findNode(site.nav, data.parentId)?.children ?? []);
        try {
          await save(site, moveNode(site.nav, node.id, data.parentId, siblings.length));
        } catch (e) {
          const key = MOVE_ERRORS[(e as Error)?.message ?? ''];
          if (!key) throw e;
          await toast(store.i18n[key]());
        }
      },

      /** Drag & drop within one level; `from`/`to` are indices in the sibling list of `parentId`. */
      async reorder(parentId: string | null, from: number, to: number): Promise<void> {
        if (from === to) return;
        const site = latest();
        if (!site) return;
        await save(site, reorderSiblings(site.nav, parentId, from, to));
      },

      /** Archives the node (a menu with its subtree); a page node also archives its page doc. */
      async archive(node: WebsiteNode): Promise<void> {
        const i18n = store.i18n;
        const message = node.type === 'menu' ? i18n.archive_confirm_menu() : node.type === 'page' ? i18n.archive_confirm_page() : i18n.archive_confirm();
        if (!await confirm(store.alertController, message, i18n.ok(), i18n.cancel(), true)) return;
        const page = node.type === 'page' && node.pageKey ? store.pagesByKey().get(node.pageKey) : undefined;
        // archive (or detach, for a page shared with other tenants) through FirestoreService.deleteModel
        if (page) await store.pageService.delete(page, store.currentUser());
        const site = latest();
        if (!site || !findNode(site.nav, node.id)) return;
        await save(site, archiveNode(site.nav, node.id));
      },

      async copyUrl(node: WebsiteNode): Promise<void> {
        try {
          await copyToClipboardDeferred(Promise.resolve(websiteUrl(node)));
          await toast(store.i18n.url_copied());
        } catch (e) {
          console.error('WebsiteSitemapStore.copyUrl', e);
        }
      },

      /** Opens the existing page edit modal (the same one «Seite konfigurieren» opens). */
      async editPage(node: WebsiteNode): Promise<void> {
        const page = node.pageKey ? store.pagesByKey().get(node.pageKey) : undefined;
        if (!page) {
          await toast(store.i18n.page_not_found());
          return;
        }
        await store.pageStore.edit(page, false, websiteUrl(node));
      },
    };
  }),
);

@Injectable()
export class WebsiteSitemapStore extends _WebsiteSitemapStore {
  constructor() {
    super();
  }
}
