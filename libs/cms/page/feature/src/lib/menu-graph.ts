import { Component, computed, effect, inject, input, output } from '@angular/core';
import { IonButton, IonCheckbox, IonIcon, IonItem, IonLabel } from '@ionic/angular';

import { MenuItemModel, PageModel, SectionModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';
import { Spinner } from '@okr/shared-ui';
import { hasRole } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { MENU_I18N_KEYS } from '@okr/cms-menu-util';
import { MenuStore } from '@okr/cms-menu-feature';
import { SectionStore } from '@okr/cms-section-feature';

import { DependencyNode, GraphMode, MenuGraphStore } from './menu-graph.store';
import { MenuGraphNode } from './menu-graph-node';
import { PageStore } from './page.store';

/**
 * The «System» view of a sitemap: the dependency tree with a level button and the CMS parts
 * as filters. `mode` picks the tree — 'app' walks the tenant's main menu
 * (menu → sub → navigate → page → context menus + sections), 'web' walks the navigation of
 * `website` (site → menus / page entries / links → pages → sections). The web tree has no
 * context menus and no catalogue ownership, so neither appears in its legend.
 *
 * Clicking a menu, page or section opens its edit modal; a website node is handed to the host
 * (`websiteNodeSelected`), which owns the website's own actions.
 *
 * The HOST provides `MenuGraphStore` (`providers: [MenuGraphStore]`), so the tree — and its
 * exports — stay available while the host shows its other view.
 */
@Component({
  selector: 'okr-menu-graph',
  standalone: true,
  imports: [SvgIconPipe, Spinner, MenuGraphNode, IonItem, IonLabel, IonButton, IonIcon, IonCheckbox],
  styles: [`
    :host { display: block; }
    .graph-container { padding: 16px; font-family: var(--ion-font-family); }
    .expand-all { display: flex; align-items: center; gap: 16px; padding: 8px 16px 0; }
    .level-label { font-size: 0.8rem; }
    .expand-all ion-button { --padding-start: 10px; --padding-end: 10px; min-width: 56px; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 16px 0; font-size: 0.8rem; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .legend-item ion-checkbox { --size: 16px; font-size: 0.8rem; }
    .legend-own { font-size: 14px; }
    .dot-menu     { background: var(--ion-color-primary); }
    .dot-navigate { background: var(--ion-color-secondary); }
    .dot-browse   { background: var(--ion-color-tertiary); }
    .dot-page     { background: var(--ion-color-success); }
    .dot-context  { background: var(--ion-color-tertiary); }
    .dot-section  { background: var(--ion-color-warning); }
  `],
  template: `
    @if (graphStore.isLoading()) {
      <okr-spinner />
    } @else if (!graphStore.dependencyTree()) {
      <ion-item lines="none">
        <ion-label>{{ pageStore.i18n.graph_nomain() }}</ion-label>
      </ion-item>
    } @else {
      <!-- How many tree levels are expanded: click to step through all → 1 → 2 → 3 -->
      <div class="expand-all">
        <span class="level-label">Level</span>
        <ion-button size="small" fill="outline" (click)="graphStore.cycleLevel()">{{ graphStore.level() }}</ion-button>
      </div>

      <!-- Legend: context and section are filters, the rest is always shown -->
      <div class="legend">
        @if (isWeb()) {
          <div class="legend-item"><div class="legend-dot dot-menu"></div> menu</div>
          <div class="legend-item"><div class="legend-dot dot-navigate"></div> page entry</div>
          <div class="legend-item"><div class="legend-dot dot-browse"></div> link</div>
          <div class="legend-item"><div class="legend-dot dot-page"></div> page</div>
        } @else {
          <div class="legend-item"><div class="legend-dot dot-menu"></div> menu / sub</div>
          <div class="legend-item"><div class="legend-dot dot-navigate"></div> navigate</div>
          <div class="legend-item"><div class="legend-dot dot-browse"></div> browse</div>
          <div class="legend-item"><div class="legend-dot dot-page"></div> page</div>
          <div class="legend-item">
            <div class="legend-dot dot-context"></div>
            <ion-checkbox labelPlacement="end" [checked]="graphStore.showContext()" (ionChange)="graphStore.setShowContext($event.detail.checked)">
              context
            </ion-checkbox>
          </div>
        }
        <div class="legend-item">
          <div class="legend-dot dot-section"></div>
          <ion-checkbox labelPlacement="end" [checked]="graphStore.showSection()" (ionChange)="graphStore.setShowSection($event.detail.checked)">
            section
          </ion-checkbox>
        </div>
        @if (!isWeb()) {
          <!-- Ownership markers — who WRITES a menu row (see MenuGraphNode.ownership). -->
          <div class="legend-item">
            <ion-icon class="legend-own" color="medium" src="{{ 'lock-closed' | svgIcon }}" />
            {{ i18nOwn.owner_catalogue() }}
          </div>
          <div class="legend-item">
            <ion-icon class="legend-own" color="warning" src="{{ 'copy' | svgIcon }}" />
            {{ i18nOwn.owner_forked() }}
          </div>
        }
      </div>

      <!-- Dependency tree -->
      <div class="graph-container">
        <okr-menu-graph-node [node]="graphStore.dependencyTree()!" (nodeEdit)="onNodeEdit($event)" />
      </div>
    }
  `
})
export class MenuGraph {
  protected readonly graphStore = inject(MenuGraphStore);
  protected readonly pageStore = inject(PageStore);
  private readonly appStore = inject(AppStore);
  private readonly menuStore = inject(MenuStore);
  private readonly sectionStore = inject(SectionStore);
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly mode = input<GraphMode>('app');
  public readonly website = input<WebsiteModel | null>(null);

  // outputs
  public readonly websiteNodeSelected = output<WebsiteNode>();

  protected readonly isWeb = computed(() => this.mode() === 'web');

  /** Legend labels for the ownership markers rendered by `MenuGraphNode`. */
  protected readonly i18nOwn = this.i18nService.translateAll({
    owner_catalogue: MENU_I18N_KEYS.owner_catalogue,
    owner_forked: MENU_I18N_KEYS.owner_forked,
  });

  /** Expand the sitemap to the default level once, as soon as the tree has loaded. */
  private hasAutoExpanded = false;

  constructor() {
    effect(() => this.graphStore.setSource(this.mode(), this.website()));
    effect(() => {
      const expandableIds = this.graphStore.allExpandableIds();
      if (!this.hasAutoExpanded && expandableIds.length > 0) {
        this.hasAutoExpanded = true;
        this.graphStore.setLevel(this.graphStore.level());
      }
    });
  }

  /** Dispatch to the appropriate store's edit() method based on node type. */
  protected async onNodeEdit(node: DependencyNode): Promise<void> {
    if (!hasRole('contentAdmin', this.appStore.currentUser())) return;

    switch (node.nodeType) {
      case 'menu':
        await this.menuStore.edit(node.model as MenuItemModel, false);
        break;
      case 'page':
        await this.pageStore.edit(node.model as PageModel, false);
        break;
      case 'section':
        this.sectionStore.setSectionId((node.model as SectionModel).okey);
        await this.sectionStore.edit(node.model as SectionModel, false);
        break;
      case 'website': {
        // the site itself and the footer group carry the WebsiteModel — nothing to act on
        const model = node.model as WebsiteNode;
        if (model.id && model.type) this.websiteNodeSelected.emit(model);
        break;
      }
    }
  }
}
