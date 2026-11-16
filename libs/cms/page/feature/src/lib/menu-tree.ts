import { Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs/operators';
import { IonBadge, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import { MenuItemModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { hasRole } from '@okr/shared-util-core';
import { VersionCheckService } from '@okr/shared-util-angular';
import { expandMenuTokens, MAX_MENU_DEPTH, resolveMenuLabelKey } from '@okr/cms-menu-util';
import { MenuItemsStore, MenuStore } from '@okr/cms-menu-feature';

import { PageStore } from './page.store';

/** One row of the flattened app menu: the menu document and how deep it hangs. */
export interface MenuTreeRow {
  item: MenuItemModel;
  depth: number;
}

/**
 * Flattens the menu below `root` in render order: each `sub` is followed by its children.
 * Context menus are not walked (they belong to a page, not to the navigation). Guards against
 * cycles and runaway depth the same way `<okr-menu>` does.
 */
export function flattenMenuTree(root: MenuItemModel, items: MenuItemModel[], depth = 0, visited = new Set<string>()): MenuTreeRow[] {
  const rows: MenuTreeRow[] = [];
  if (depth >= MAX_MENU_DEPTH) return rows;
  const next = new Set(visited).add(root.name);
  for (const name of root.menuItems ?? []) {
    if (next.has(name)) continue;
    const item = items.find(i => i.name === name);
    if (!item || item.action === 'context') continue;
    rows.push({ item, depth });
    if (item.action === 'sub') rows.push(...flattenMenuTree(item, items, depth + 1, next));
  }
  return rows;
}

/** A row's translated label, expanded like the live menu (tokens incl. the two domains). */
@Component({
  selector: 'okr-menu-tree-item',
  standalone: true,
  imports: [SvgIconPipe, IonItem, IonIcon, IonLabel, IonBadge],
  template: `
    <ion-item button [detail]="false" lines="inset" [style.--padding-start]="indent()" (click)="selected.emit(row().item)">
      <ion-icon slot="start" src="{{ (row().item.icon || 'menu') | svgIcon }}" />
      <ion-label>
        <h2>{{ label() || row().item.name }}</h2>
        @if (url()) {
          <p>{{ url() }}</p>
        }
      </ion-label>
      <ion-badge slot="end" color="light">{{ row().item.action }}</ion-badge>
    </ion-item>
  `,
})
export class MenuTreeItem {
  private readonly i18nService = inject(I18nService);
  private readonly versionService = inject(VersionCheckService);
  private readonly appStore = inject(AppStore);

  public readonly row = input.required<MenuTreeRow>();
  public readonly selected = output<MenuItemModel>();

  protected readonly indent = computed(() => `${16 + this.row().depth * 24}px`);
  protected readonly url = computed(() => {
    const item = this.row().item;
    return item.action === 'navigate' || item.action === 'browse' ? item.url : '';
  });

  private readonly labelKey = computed(() =>
    resolveMenuLabelKey(this.row().item.label ?? '', { version: this.versionService.getCurrentVersion() }));

  protected readonly label = toSignal(
    toObservable(this.labelKey).pipe(
      switchMap(key => key ? this.i18nService.translate(key) : [''] as string[]),
      map(text => expandMenuTokens(text, {
        version: this.versionService.getCurrentVersion(),
        tenantId: this.appStore.tenantId(),
        appDomain: this.appStore.appConfig()?.appDomain,
      }).trim()),
    ),
    { initialValue: '' }
  );
}

/**
 * The «Website» view of the app sitemap: the tenant's main menu as a plain indented list, the
 * way a visitor walks it — the same look as the website sitemap. A click opens the menu entry.
 * The «System» view (`MenuGraph`) adds pages, sections, context menus and ownership.
 */
@Component({
  selector: 'okr-menu-tree',
  standalone: true,
  imports: [MenuTreeItem, IonList, IonItem, IonLabel],
  template: `
    @if (rows().length === 0) {
      <ion-item lines="none">
        <ion-label>{{ pageStore.i18n.graph_nomain() }}</ion-label>
      </ion-item>
    } @else {
      <ion-list>
        @for (row of rows(); track row.item.okey + '-' + $index) {
          <okr-menu-tree-item [row]="row" (selected)="edit($event)" />
        }
      </ion-list>
    }
  `,
})
export class MenuTree {
  private readonly menuItemsStore = inject(MenuItemsStore);
  private readonly menuStore = inject(MenuStore);
  private readonly appStore = inject(AppStore);
  protected readonly pageStore = inject(PageStore);

  /** Name of the root menu; defaults to the tenant's main menu. */
  public readonly rootName = input<string>('');

  protected readonly rows = computed<MenuTreeRow[]>(() => {
    const items = this.menuItemsStore.menuItems() ?? [];
    const rootName = this.rootName() || `main_${this.appStore.tenantId()}`;
    const root = items.find(i => i.name === rootName);
    return root ? flattenMenuTree(root, items) : [];
  });

  protected async edit(item: MenuItemModel): Promise<void> {
    if (!hasRole('contentAdmin', this.appStore.currentUser())) return;
    await this.menuStore.edit(item, false);
  }
}
