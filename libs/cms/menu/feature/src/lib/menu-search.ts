import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonIcon, IonItem, IonLabel, IonList, IonSearchbar } from '@ionic/angular';
import { combineLatest, map, of } from 'rxjs';

import { MenuItemModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { hasRole } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';

import {
  collectMenuSearchRows, expandMenuTokens, filterMenuSearchRows, isHiddenOnNarrowScreen, menuSearchText, MenuSearchRow,
  resolveMenuLabelKey, WIDE_SCREEN_QUERY,
} from '@okr/cms-menu-util';

import { MenuItemsStore } from './menu-items.store';
import { MenuStore } from './menu.store';

/**
 * The search field at the top of the main menu (sidebar and static layout), shown while
 * `app-config.useMenuSearch` is true — the host decides that, this component only searches.
 *
 * What it matches (see `menuSearchText`): the stored `index` (name, action, key, ` nn:<nickName>`)
 * and the label TRANSLATED INTO THE CURRENT LANGUAGE. The translation is never written into the
 * index: a stored text would hold one language only, go stale with every bundle or tenant override,
 * and be missing on every row the feature picker or a seed script writes.
 *
 * Which rows: `navigate` and `browse` rows below the root that pass the same gates as the rendered
 * menu — role (`roleNeeded`), feature block, `hiddenMenuKeys`, missing token values (`MenuStore.isVisible`)
 * and the narrow-screen flag. A row inside a hidden `sub` is not offered either.
 *
 * Cost: the labels are translated only once the person has focused the field (`armed`), not at
 * boot. The rendered menu creates the entries of a `sub` on its first expand for the same reason.
 */
@Component({
  selector: 'okr-menu-search',
  imports: [IonSearchbar, IonList, IonItem, IonLabel, IonIcon, SvgIconPipe],
  providers: [MenuStore],
  styles: [`
    ion-searchbar { --box-shadow: none; padding-inline: 8px; }
    ion-label p { font-size: 12px; color: var(--ion-color-medium); }
    ion-icon { color: var(--ion-color-dark); margin-inline-end: 12px; }
    @media (prefers-color-scheme: dark) { ion-icon { color: var(--ion-color-white); } }
  `],
  template: `
    <ion-searchbar [debounce]="150" [value]="term()" [placeholder]="store.i18n.search_placeholder()"
      (ionFocus)="armed.set(true)" (ionInput)="onInput($event)" (ionClear)="term.set('')" />
    @if (isSearching()) {
      <ion-list>
        @for (row of results(); track row.item.name) {
          <ion-item button detail="false" (click)="select(row.item)">
            <ion-icon slot="start" src="{{ (row.item.icon || 'help-circle') | svgIcon }}" />
            <ion-label>
              {{ labelOf(row.item.name) }}
              @if (pathOf(row); as path) { <p>{{ path }}</p> }
            </ion-label>
          </ion-item>
        } @empty {
          <ion-item lines="none"><ion-label color="medium">{{ store.i18n.search_empty() }}</ion-label></ion-item>
        }
      </ion-list>
    }
  `,
})
export class MenuSearch {
  protected readonly store = inject(MenuStore);
  private readonly menuItemsStore = inject(MenuItemsStore);

  /** `name` of the root menu document (`main_<tenantId>`) whose tree is searched. */
  public readonly rootName = input.required<string>();
  /** True while a term is entered: the host hides its rows and shows the results instead. */
  public readonly searching = output<boolean>();

  protected readonly term = signal('');
  /** Set on the first focus: from then on the labels are translated. */
  protected readonly armed = signal(false);
  protected readonly isSearching = computed(() => this.term().trim().length > 0);

  private readonly isWideScreen = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_SCREEN_QUERY).matches : true;

  /** Every row the search may offer, with the `sub` rows above it. */
  private readonly rows = computed<MenuSearchRow[]>(() => {
    const user = this.store.currentUser();
    return collectMenuSearchRows(this.rootName(), this.menuItemsStore.menuItems() ?? [], (item: MenuItemModel) =>
      hasRole(item.roleNeeded, user) && this.store.isVisible(item.name) && !isHiddenOnNarrowScreen(item, this.isWideScreen));
  });

  /** The documents whose labels are needed: the rows and their `sub` ancestors. */
  private readonly labelItems = computed<MenuItemModel[]>(() => {
    const byName = new Map((this.menuItemsStore.menuItems() ?? []).map(i => [i.name, i]));
    const names = new Set<string>();
    for (const row of this.rows()) {
      names.add(row.item.name);
      row.ancestors.forEach(a => names.add(a));
    }
    return [...names].map(n => byName.get(n)).filter((i): i is MenuItemModel => !!i);
  });

  /** `name` -> label in the current language, with the menu tokens expanded. Re-emits on a language change. */
  private readonly labels = rxResource({
    params: resourceParams(() => this.armed() ? this.labelItems().map(i => `${i.name}\u0000${i.label ?? ''}`) : undefined),
    stream: ({ params }) => {
      if (!params.length) return of(new Map<string, string>());
      const ctx = {
        version: this.store.versionService.getCurrentVersion(), releaseDate: this.store.versionService.getCurrentReleaseDate(),
        tenantId: this.store.appStore.tenantId(), booksId: this.store.selectedBooks.current(),
        appDomain: this.store.appStore.appConfig()?.appDomain ?? '',
      };
      const entries = params.map(p => {
        const [name, label] = p.split('\u0000');
        return this.store.i18nService.translate(resolveMenuLabelKey(label, ctx)).pipe(
          map(text => [name, expandMenuTokens(text ?? '', ctx).trim()] as const),
        );
      });
      return combineLatest(entries).pipe(map(pairs => new Map<string, string>(pairs)));
    },
  });

  protected readonly results = computed<MenuSearchRow[]>(() => {
    const labels = this.labels.hasValue() ? this.labels.value() : new Map<string, string>();
    return filterMenuSearchRows(this.rows(), this.term(), row => menuSearchText(row.item, labels.get(row.item.name) ?? ''));
  });

  constructor() {
    effect(() => this.store.setMenuName(this.rootName()));
    effect(() => this.searching.emit(this.isSearching()));
  }

  protected labelOf(name: string): string {
    const labels = this.labels.hasValue() ? this.labels.value() : undefined;
    return labels?.get(name) || name;
  }

  /** «Ressourcen › Boote»: the translated `sub` rows above a result; '' at the top level. */
  protected pathOf(row: MenuSearchRow): string {
    return row.ancestors.map(a => this.labelOf(a)).join(' › ');
  }

  protected onInput(event: Event): void {
    this.armed.set(true);
    this.term.set(String((event as CustomEvent<{ value?: string | null }>).detail?.value ?? ''));
  }

  /** Clears the field first, so the menu shows its rows again the next time it opens. */
  protected select(item: MenuItemModel): void {
    this.term.set('');
    void this.store.select(item, false);
  }
}
