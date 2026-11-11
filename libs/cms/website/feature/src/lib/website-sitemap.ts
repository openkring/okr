import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonContent, IonItem, IonLabel, IonList, IonNote,
  IonReorderGroup, ItemReorderEventDetail,
} from '@ionic/angular';

import { WebsiteNode } from '@okr/shared-models';
import { EmptyList, Header, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { WebsiteTreeItem } from '@okr/cms-website-ui';
import { WebsiteI18n, WebsiteWarningCode, websiteUrl } from '@okr/cms-website-util';

import { WebsiteSitemapStore } from './website-sitemap.store';

const WARNING_KEYS: Partial<Record<WebsiteWarningCode, keyof WebsiteI18n>> = {
  homeMissing: 'warning_home_missing',
};

/**
 * The website navigation of one site (`websites/{siteId}`) as a tree: reorder within a level by
 * drag & drop, everything else through the ActionSheet of a node (fixed order, design §6.2).
 */
@Component({
  selector: 'okr-website-sitemap',
  standalone: true,
  imports: [
    NgTemplateOutlet, Header, Spinner, EmptyList, WebsiteTreeItem,
    IonContent, IonList, IonReorderGroup, IonItem, IonLabel, IonNote, IonButton,
  ],
  providers: [WebsiteSitemapStore],
  template: `
    <okr-header [i18n]="{ title: title() }"
      [actionIcon]="canAdd() ? 'add' : ''" [actionTitle]="store.i18n.sitemap_add_top()"
      (actionClicked)="showTopActions()" />
    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (!store.website()) {
        <okr-empty-list [message]="store.i18n.sitemap_no_site()" />
        @if (store.canEdit()) {
          <div class="ion-padding ion-text-center">
            <ion-button (click)="store.createSite()">{{ store.i18n.sitemap_create_site() }}</ion-button>
          </div>
        }
      } @else {
        @if (store.canEdit()) {
          <ion-item lines="none">
            <ion-label><ion-note>{{ store.lastPublishedText() }}</ion-note></ion-label>
            @if (store.canRollback() && store.website()?.lastPublishedVersion) {
              <ion-button slot="end" fill="clear" size="small" [disabled]="store.isPublishing()" (click)="store.rollback()">
                {{ store.i18n.rollback_action() }}
              </ion-button>
            }
            <ion-button slot="end" [disabled]="store.isPublishing()" (click)="store.publish()">
              {{ store.i18n.publish_button() }}
            </ion-button>
          </ion-item>
        }
        @for (code of store.siteLevelWarnings(); track code) {
          <ion-item lines="none">
            <ion-label><ion-note color="warning">{{ siteWarningText(code) }}</ion-note></ion-label>
          </ion-item>
        }
        @if (store.nav().length === 0) {
          <okr-empty-list [message]="store.i18n.sitemap_empty()" />
        } @else {
          <ion-list>
            <ng-container *ngTemplateOutlet="level; context: { $implicit: store.nav(), parentId: null, depth: 0 }" />
          </ion-list>
        }
      }
    </ion-content>

    <!-- one reorder group per level; each child wraps its row and its own subtree -->
    <ng-template #level let-nodes let-parentId="parentId" let-depth="depth">
      <ion-reorder-group [disabled]="!store.canEdit()" (ionItemReorder)="onReorder(parentId, $any($event))">
        @for (node of nodes; track node.id) {
          <div>
            <okr-website-tree-item [node]="node" [depth]="depth" [i18n]="store.i18n" [readOnly]="!store.canEdit()"
              [warnings]="store.warningsByNode().get(node.id) ?? []"
              [draftCount]="node.type === 'page' ? (store.draftsByPage().get(node.pageKey ?? '') ?? 0) : 0"
              (selected)="showActions($event)" />
            @if (node.children?.length) {
              <ng-container *ngTemplateOutlet="level; context: { $implicit: node.children, parentId: node.id, depth: depth + 1 }" />
            }
          </div>
        }
      </ion-reorder-group>
    </ng-template>
  `,
})
export class WebsiteSitemap {
  protected readonly store = inject(WebsiteSitemapStore);
  private readonly actionSheetController = inject(ActionSheetController);

  /** route param `:siteId` (= tenant id for now, design §6.1) */
  public readonly siteId = input('');

  protected readonly canAdd = computed(() => this.store.canEdit() && !!this.store.website());
  protected readonly title = computed(() => {
    const name = this.store.siteName() || this.store.i18n.sitemap_title();
    if (!this.store.website()) return name;
    return `${name} · ${fill(this.store.i18n.sitemap_count(), { count: this.store.nodeCount() })}`;
  });

  constructor() {
    effect(() => this.store.setSiteId(this.siteId() ?? ''));
  }

  protected siteWarningText(code: WebsiteWarningCode): string {
    const key = WARNING_KEYS[code];
    return key ? this.store.i18n[key]() : code;
  }

  protected async onReorder(parentId: string | null, ev: CustomEvent<ItemReorderEventDetail>): Promise<void> {
    // ionItemReorder bubbles: a drag in a nested menu also reaches every ancestor group. Only the
    // group that owns the dragged item handles it, with its own parentId.
    if (ev.target !== ev.currentTarget) return;
    const { from, to } = ev.detail;
    ev.detail.complete();
    await this.store.reorder(parentId, from, to);
  }

  /** «+» in the header: the three add actions on the top level. */
  protected async showTopActions(): Promise<void> {
    const i18n = this.store.i18n;
    const base = this.store.imgixBaseUrl();
    const options = createActionSheetOptions(i18n.sitemap_add_top());
    options.buttons.push(createActionSheetButton('node.addMenu', i18n.action_add_menu(), base, 'menu'));
    options.buttons.push(createActionSheetButton('node.addPage', i18n.action_add_page(), base, 'page'));
    options.buttons.push(createActionSheetButton('node.addLink', i18n.action_add_link(), base, 'link'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), base, 'cancel'));
    await this.executeActions(options, null);
  }

  protected async showActions(node: WebsiteNode): Promise<void> {
    const options = createActionSheetOptions(node.label || this.store.i18n.as_title());
    this.addActionSheetButtons(options, node);
    await this.executeActions(options, node);
  }

  /** The fixed order of design §6.2 per node type; archived nodes and read-only users get none. */
  private addActionSheetButtons(options: ActionSheetOptions, node: WebsiteNode): void {
    if (!this.store.canEdit() || node.isArchived) return;
    const i18n = this.store.i18n;
    const base = this.store.imgixBaseUrl();
    const push = (name: string, text: string, icon: string) => options.buttons.push(createActionSheetButton(name, text, base, icon));
    switch (node.type) {
      case 'menu':
        push('node.addMenu', i18n.action_add_menu(), 'menu');
        push('node.addPage', i18n.action_add_page(), 'page');
        push('node.addLink', i18n.action_add_link(), 'link');
        push('node.edit', i18n.action_edit(), 'edit');
        if (websiteUrl(node)) push('node.copyUrl', i18n.action_copy_url(), 'copy');
        push('node.move', i18n.action_move(), 'swap-vertical');
        push('node.archive', i18n.action_archive(), 'archive');
        break;
      case 'page':
        push('node.editPage', i18n.action_edit_page(), 'edit');
        push('node.edit', i18n.action_edit_entry(), 'edit');
        push('node.copyUrl', i18n.action_copy_url(), 'copy');
        push('node.move', i18n.action_move(), 'swap-vertical');
        push('node.archive', i18n.action_archive(), 'archive');
        break;
      case 'link':
        push('node.edit', i18n.action_edit(), 'edit');
        push('node.copyUrl', i18n.action_copy_url(), 'copy');
        push('node.move', i18n.action_move(), 'swap-vertical');
        push('node.archive', i18n.action_archive(), 'archive');
        break;
    }
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), base, 'cancel'));
  }

  /** `node` null = the top level (header «+»). */
  private async executeActions(options: ActionSheetOptions, node: WebsiteNode | null): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    const parentId = node?.id ?? null;
    switch (data.action) {
      case 'node.addMenu':  await this.store.addMenu(parentId); break;
      case 'node.addPage':  await this.store.addPage(parentId); break;
      case 'node.addLink':  await this.store.addLink(parentId); break;
      case 'node.edit':     if (node) await this.store.edit(node); break;
      case 'node.editPage': if (node) await this.store.editPage(node); break;
      case 'node.copyUrl':  if (node) await this.store.copyUrl(node); break;
      case 'node.move':     if (node) await this.store.move(node); break;
      case 'node.archive':  if (node) await this.store.archive(node); break;
    }
  }
}
